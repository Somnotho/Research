"""Fixed scientific operations. No eval, shell, user code, imports, or filesystem paths in requests."""
import ast
import json
import math
import os
import resource
import sys

resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
resource.setrlimit(resource.RLIMIT_AS, (2 * 1024**3, 2 * 1024**3))
resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024**2, 16 * 1024**2))
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
import sympy as sp
import numpy as np
from scipy import stats
import z3
import pint


def parse_expression(source):
    tree = ast.parse(source.replace('^', '**'), mode='eval')
    if sum(1 for _ in ast.walk(tree)) > 120:
        raise ValueError('Expression is too complex')

    def build_expression(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            if not math.isfinite(node.value) or abs(node.value) > 1e12:
                raise ValueError('Numeric literal exceeds limits')
            return sp.Rational(str(node.value))
        if isinstance(node, ast.Name) and node.id.isascii() and node.id.isidentifier() and len(node.id) <= 20 and not node.id.startswith('_'):
            return {'pi': sp.pi, 'E': sp.E}.get(node.id, sp.Symbol(node.id, real=True))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            value = build_expression(node.operand)
            return -value if isinstance(node.op, ast.USub) else value
        if isinstance(node, ast.BinOp):
            left, right = build_expression(node.left), build_expression(node.right)
            if isinstance(node.op, ast.Add): return left + right
            if isinstance(node.op, ast.Sub): return left - right
            if isinstance(node.op, ast.Mult): return left * right
            if isinstance(node.op, ast.Div): return left / right
            if isinstance(node.op, ast.Pow) and right.is_number and abs(float(right)) <= 12: return left**right
            raise ValueError('Only arithmetic and bounded numeric powers are supported')
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and len(node.args) == 1 and not node.keywords:
            functions = {'sin': sp.sin, 'cos': sp.cos, 'tan': sp.tan, 'exp': sp.exp, 'log': sp.log, 'sqrt': sp.sqrt, 'abs': sp.Abs}
            if node.func.id in functions: return functions[node.func.id](build_expression(node.args[0]))
        raise ValueError('Unsupported expression syntax')
    return build_expression(tree.body)


def prove_linear(input):
    variables = {}
    def build_term(expression):
        value = parse_expression(expression)
        symbols = sorted(value.free_symbols, key=str)
        if symbols and sp.Poly(value, *symbols).total_degree() > 1:
            raise ValueError('Formal checks support linear real arithmetic only')
        expanded = sp.expand(value)
        constant = expanded
        result = z3.RealVal(0)
        for symbol in symbols:
            coefficient = expanded.coeff(symbol)
            if not coefficient.is_Rational: raise ValueError('Rational linear coefficients required')
            variable = variables.setdefault(str(symbol), z3.Real(str(symbol)))
            result += z3.RealVal(str(coefficient)) * variable
            constant -= coefficient * symbol
        if not constant.is_Rational: raise ValueError('Rational linear constants required')
        return result + z3.RealVal(str(constant))

    def build_assertion(source):
        tree = ast.parse(source, mode='eval').body
        if not isinstance(tree, ast.Compare) or len(tree.ops) != 1:
            raise ValueError('Use one comparison per assertion, e.g. x >= 0')
        left, right = build_term(ast.unparse(tree.left)), build_term(ast.unparse(tree.comparators[0]))
        operator = tree.ops[0]
        if isinstance(operator, ast.Gt): return left > right
        if isinstance(operator, ast.GtE): return left >= right
        if isinstance(operator, ast.Lt): return left < right
        if isinstance(operator, ast.LtE): return left <= right
        if isinstance(operator, ast.Eq): return left == right
        if isinstance(operator, ast.NotEq): return left != right
        raise ValueError('Unsupported comparison')
    solver = z3.Solver()
    solver.set(timeout=3000)
    solver.add(*(build_assertion(item) for item in input['premises']))
    premises_status = solver.check()
    if premises_status == z3.unsat: return {'status': 'inconsistent_premises', 'proven': False, 'method': 'Z3 linear real arithmetic; inconsistent assumptions do not establish a useful theorem'}
    solver.add(z3.Not(build_assertion(input['conclusion'])))
    status = solver.check()
    return {'status': str(status), 'proven': status == z3.unsat, 'counterexample': str(solver.model()) if status == z3.sat else None,
            'method': 'Z3 checked whether the premises and negation of the conclusion have a real-valued counterexample. Applies only to these formalized linear assertions.'}


def execute_experiment(input):
    operation = input['operation']
    if operation == 'prove_linear': return prove_linear(input)
    if operation == 'matrix':
        rows = input['matrix']
        if len({len(row) for row in rows}) != 1: raise ValueError('Matrix rows must have the same length')
        matrix = sp.Matrix([[sp.Rational(str(value)) for value in row] for row in rows])
        square = matrix.rows == matrix.cols
        return {'shape': list(matrix.shape), 'rank': matrix.rank(), 'determinant': str(matrix.det()) if square else None,
                'eigenvalues': {str(value): count for value, count in matrix.eigenvals().items()} if square and matrix.rows <= 4 else None,
                'inverse': [[str(cell) for cell in row] for row in matrix.inv().tolist()] if square and matrix.det() != 0 else None}
    if operation == 'statistics':
        baseline, candidate = np.asarray(input['baseline']), np.asarray(input['candidate'])
        test = stats.ttest_ind(baseline, candidate, equal_var=False)
        return {'baseline_mean': float(np.mean(baseline)), 'candidate_mean': float(np.mean(candidate)), 'mean_difference': float(np.mean(candidate)-np.mean(baseline)),
                'welch_t_statistic': float(test.statistic) if math.isfinite(test.statistic) else None, 'p_value': float(test.pvalue) if math.isfinite(test.pvalue) else None, 'baseline_count': len(baseline), 'candidate_count': len(candidate),
                'assumptions': ['Independent observations', 'Welch two-sided t-test; association does not establish causation', 'Check sampling and distribution assumptions before decisions']}
    if operation == 'monte_carlo':
        generator = np.random.default_rng(input['seed'])
        # One uncertain savings level per scenario, sustained throughout the horizon.
        savings = np.maximum(0, generator.normal(input['monthly_savings'], input['monthly_savings']*input['savings_uncertainty'], input['samples']))
        benefit = -input['upfront_cost']+(savings-input['monthly_running_cost'])*input['months']
        counts, edges = np.histogram(benefit, bins=20)
        return {'seed': input['seed'], 'samples': input['samples'], 'probability_positive_benefit': float(np.mean(benefit > 0)),
                'net_benefit_p05': float(np.quantile(benefit, .05)), 'net_benefit_p50': float(np.quantile(benefit, .5)), 'net_benefit_p95': float(np.quantile(benefit, .95)),
                'histogram': {'counts': counts.tolist(), 'edges': edges.tolist()},
                'assumptions': ['Savings normally distributed and clipped at zero', 'One uncertain monthly savings level sustained for the horizon', 'No discounting, tax, inflation or causal inference; user-supplied distribution']}
    if operation == 'convert_units':
        units = pint.UnitRegistry()
        if any(character in input['source_unit']+input['target_unit'] for character in ['[',']',';', '\n']): raise ValueError('Unsupported unit syntax')
        result = units.Quantity(input['value'], input['source_unit']).to(input['target_unit'])
        return {'value': result.magnitude, 'unit': str(result.units), 'dimensionality': str(result.dimensionality)}
    if operation == 'verify_identity':
        difference = sp.simplify(parse_expression(input['left'])-parse_expression(input['right']))
        return {'verified': difference == 0, 'difference': str(difference), 'latex': sp.latex(difference),
                'scope': 'Symbolic simplification over real symbols where both expressions are defined. Singularities/domain restrictions must be checked separately; not a universal theorem prover.'}
    expression = parse_expression(input['expression'])
    variable = sp.Symbol(input.get('variable', 'x'), real=True)
    if operation == 'simplify': result = sp.simplify(expression)
    elif operation == 'differentiate': result = sp.diff(expression, variable)
    elif operation == 'integrate': result = sp.integrate(expression, variable)
    elif operation == 'solve':
        result = sp.solve(expression, variable)
        return {'solutions': [str(value) for value in result], 'latex': [sp.latex(value) for value in result], 'equation': f'{expression} = 0', 'domain': 'Real symbol assumptions; verify solution domain and singularities'}
    elif operation == 'evaluate':
        result = expression.subs({sp.Symbol(name, real=True): sp.Rational(str(value)) for name, value in input['values'].items()})
        if result.free_symbols: raise ValueError('Provide values for all variables')
        result = sp.N(result, 15)
        if result.is_real is not True or result.is_finite is not True: raise ValueError('Result is not finite and real')
    else: raise ValueError('Unknown operation')
    return {'result': str(result), 'latex': sp.latex(result), 'variables': sorted(str(symbol) for symbol in expression.free_symbols), 'method': f'SymPy {operation}; all variables assumed real'}


try:
    input = json.loads(sys.stdin.read(1000000))
    result = execute_experiment(input)
    print(json.dumps({'result': result, 'engine': {'sympy': sp.__version__, 'numpy': np.__version__, 'z3': z3.get_version_string()}}, allow_nan=False))
except Exception as error:
    print(json.dumps({'error': str(error)[:500]}))
    sys.exit(1)
