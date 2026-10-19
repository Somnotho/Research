import test from 'node:test';
import assert from 'node:assert/strict';
import { execute_experiment } from '../backend/services/scientific_service/executor.ts';
import { validate_source_url } from '../backend/services/evidence_service/retrieval.ts';
import { parse_plan, inspect_citations } from '../backend/services/research_service/planning.ts';

test('executes differentiation, integration, solving and numeric substitution with SymPy', async () => {
  const derivative = await execute_experiment({
    operation: 'differentiate',
    expression: 'x**3',
    variable: 'x',
    values: {},
  });
  assert.equal((derivative.result as any).result, '3*x**2');
  const integral = await execute_experiment({
    operation: 'integrate',
    expression: '2*x',
    variable: 'x',
    values: {},
  });
  assert.equal((integral.result as any).result, 'x**2');
  const solutions = await execute_experiment({
    operation: 'solve',
    expression: 'x**2-4',
    variable: 'x',
    values: {},
  });
  assert.deepEqual((solutions.result as any).solutions, ['-2', '2']);
  const numeric = await execute_experiment({
    operation: 'evaluate',
    expression: 'x**2+1',
    variable: 'x',
    values: { x: 3 },
  });
  assert.equal(Number((numeric.result as any).result), 10);
});
test('checks identities and rejects expression code injection and oversized powers', async () => {
  const identity = await execute_experiment({
    operation: 'verify_identity',
    left: 'sin(x)**2+cos(x)**2',
    right: '1',
  });
  assert.equal((identity.result as any).verified, true);
  await assert.rejects(
    execute_experiment({
      operation: 'simplify',
      expression: "__import__('os').system('id')",
      variable: 'x',
      values: {},
    }),
  );
  await assert.rejects(
    execute_experiment({ operation: 'simplify', expression: 'x**100000', variable: 'x', values: {} }),
  );
});
test('formal linear solver proves valid assertions and returns counterexamples or inconsistent premises', async () => {
  const valid = await execute_experiment({
    operation: 'prove_linear',
    premises: ['x >= 0', 'y >= 0'],
    conclusion: 'x+y >= 0',
  });
  assert.equal((valid.result as any).proven, true);
  const invalid = await execute_experiment({
    operation: 'prove_linear',
    premises: ['x >= 0'],
    conclusion: 'x > 0',
  });
  assert.equal((invalid.result as any).proven, false);
  assert.match((invalid.result as any).counterexample, /x = 0/);
  const inconsistent = await execute_experiment({
    operation: 'prove_linear',
    premises: ['x > 0', 'x < 0'],
    conclusion: 'x > 10',
  });
  assert.equal((inconsistent.result as any).status, 'inconsistent_premises');
});
test('computes actual matrix properties and physically compatible unit conversion', async () => {
  const matrix = await execute_experiment({
    operation: 'matrix',
    matrix: [
      [2, 1],
      [1, 2],
    ],
  });
  assert.equal((matrix.result as any).determinant, '3');
  assert.deepEqual((matrix.result as any).eigenvalues, { '3': 1, '1': 1 });
  const units = await execute_experiment({
    operation: 'convert_units',
    value: 1000,
    source_unit: 'watt',
    target_unit: 'kilowatt',
  });
  assert.equal((units.result as any).value, 1);
  await assert.rejects(
    execute_experiment({ operation: 'convert_units', value: 1, source_unit: 'meter', target_unit: 'second' }),
  );
});
test('Monte Carlo is reproducible and statistical tests preserve measured inputs', async () => {
  const input = {
    operation: 'monte_carlo' as const,
    upfront_cost: 1200,
    monthly_savings: 100,
    monthly_running_cost: 0,
    savings_uncertainty: 0.2,
    months: 12,
    samples: 2000,
    seed: 42,
  };
  const first = await execute_experiment(input);
  const second = await execute_experiment(input);
  assert.deepEqual(first, second);
  assert.ok(
    (first.result as any).probability_positive_benefit > 0.45 &&
      (first.result as any).probability_positive_benefit < 0.55,
  );
  const comparison = await execute_experiment({
    operation: 'statistics',
    baseline: [10, 11, 12, 13, 9],
    candidate: [5, 6, 7, 6, 8],
  });
  assert.equal((comparison.result as any).baseline_mean, 11);
  assert.ok((comparison.result as any).p_value < 0.01);
});
test('source retrieval rejects local, private and credential-bearing destinations', async () => {
  for (const url of [
    'http://example.com',
    'https://127.0.0.1',
    'https://169.254.169.254',
    'https://10.0.0.1',
    'https://user:password@example.com',
    'https://example.com:8080',
  ])
    await assert.rejects(validate_source_url(url));
});
test('agent plans are constrained and citation audit identifies unknown references', () => {
  assert.throws(() => parse_plan('{"objective":"test","tasks":[],"tool_calls":[]}'));
  assert.throws(() =>
    parse_plan(
      JSON.stringify({
        objective: 'test',
        tasks: [{ owner: 'science', task: 'test' }],
        tool_calls: [
          { purpose: 'execute', assumptions: [], input: { operation: 'execute_shell', command: 'id' } },
        ],
      }),
    ),
  );
  assert.deepEqual(
    inspect_citations('See https://example.com and https://unknown.example', ['https://example.com'])
      .unrecognized_urls,
    ['https://unknown.example'],
  );
});
