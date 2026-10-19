// UI boundary: scientific_service. Fixed operations execute in resource-limited Python subprocesses.
import { useEffect, useState } from 'react';
import { list_experiments, create_experiment, type Experiment } from '../services/scientific_service';
import { MarkdownView } from '../components/markdown_view';

const operations = {
  simplify: 'Simplify an expression',
  differentiate: 'Differentiate',
  integrate: 'Integrate',
  solve: 'Solve an equation',
  evaluate: 'Evaluate with values',
  verify_identity: 'Check a symbolic identity',
  prove_linear: 'Check a formal linear claim',
  matrix: 'Analyze a matrix',
  statistics: 'Compare experimental samples',
  monte_carlo: 'Simulate financial uncertainty',
  convert_units: 'Convert physical units',
};
export function SciencePage({ project_id }: { project_id: string }) {
  const [operation, set_operation] = useState<keyof typeof operations>('differentiate');
  const [experiments, set_experiments] = useState<Experiment[]>([]);
  const [error, set_error] = useState('');
  const [busy, set_busy] = useState(false);
  useEffect(() => {
    void list_experiments(project_id)
      .then(set_experiments)
      .catch((error) => set_error(error.message));
  }, [project_id]);
  async function submit_experiment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    set_busy(true);
    set_error('');
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const number = (name: string) => Number(text(name));
    const series = (name: string) =>
      text(name)
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
    let input: Record<string, unknown> = { operation };
    try {
      if (['simplify', 'differentiate', 'integrate', 'solve', 'evaluate'].includes(operation))
        input = {
          ...input,
          expression: text('expression'),
          variable: text('variable') || 'x',
          values: JSON.parse(text('values') || '{}'),
        };
      if (operation === 'verify_identity') input = { ...input, left: text('left'), right: text('right') };
      if (operation === 'prove_linear')
        input = {
          ...input,
          premises: text('premises').split('\n').filter(Boolean),
          conclusion: text('conclusion'),
        };
      if (operation === 'matrix') input.matrix = JSON.parse(text('matrix'));
      if (operation === 'statistics')
        input = { ...input, baseline: series('baseline'), candidate: series('candidate') };
      if (operation === 'convert_units')
        input = {
          ...input,
          value: number('value'),
          source_unit: text('source_unit'),
          target_unit: text('target_unit'),
        };
      if (operation === 'monte_carlo')
        input = {
          ...input,
          upfront_cost: number('upfront_cost'),
          monthly_savings: number('monthly_savings'),
          monthly_running_cost: number('monthly_running_cost'),
          savings_uncertainty: number('savings_uncertainty') / 100,
          months: number('months'),
          samples: 2000,
          seed: 42,
        };
      await create_experiment(project_id, input);
      set_experiments(await list_experiments(project_id));
    } catch (error) {
      set_error((error as Error).message);
    } finally {
      set_busy(false);
    }
  }
  const expression_operation = ['simplify', 'differentiate', 'integrate', 'solve', 'evaluate'].includes(
    operation,
  );
  return (
    <section>
      <div className="panel">
        <span className="eyebrow">CALCULATE · TEST · VERIFY</span>
        <h2>Scientific workbench</h2>
        <p className="intro">
          Run reproducible computations. Saved inputs, engine versions and results become evidence for the
          research team. These tools work locally without an AI key.
        </p>
        <form onSubmit={submit_experiment}>
          <label>
            Scientific operation
            <select
              value={operation}
              onChange={(event) => set_operation(event.target.value as keyof typeof operations)}
            >
              {Object.entries(operations).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="scenario_form" key={operation}>
            {expression_operation && (
              <>
                <label>
                  Expression{operation === 'solve' ? ' (equal to zero)' : ''}
                  <input name="expression" maxLength={500} required defaultValue="x**2 + 2*x + 1" />
                </label>
                <label>
                  Variable
                  <input name="variable" defaultValue="x" pattern="[a-zA-Z][a-zA-Z0-9_]*" />
                </label>
                {operation === 'evaluate' && (
                  <label>
                    Values as JSON
                    <input name="values" defaultValue={'{"x": 3}'} />
                  </label>
                )}
              </>
            )}
            {operation === 'verify_identity' && (
              <>
                <label>
                  Left expression
                  <input name="left" required defaultValue="sin(x)**2 + cos(x)**2" />
                </label>
                <label>
                  Right expression
                  <input name="right" required defaultValue="1" />
                </label>
              </>
            )}
            {operation === 'prove_linear' && (
              <>
                <label>
                  Premises, one comparison per line
                  <textarea className="visual_input" name="premises" defaultValue={'x >= 0\ny >= 0'} />
                </label>
                <label>
                  Conclusion
                  <input name="conclusion" required defaultValue="x + y >= 0" />
                </label>
              </>
            )}
            {operation === 'matrix' && (
              <label>
                Matrix as a JSON array
                <textarea className="visual_input" name="matrix" required defaultValue="[[2, 1], [1, 2]]" />
              </label>
            )}
            {operation === 'statistics' && (
              <>
                <label>
                  Baseline measurements
                  <textarea
                    className="visual_input"
                    name="baseline"
                    required
                    placeholder="10, 12, 11, 13, 9"
                  />
                </label>
                <label>
                  Candidate measurements
                  <textarea className="visual_input" name="candidate" required placeholder="8, 7, 9, 8, 6" />
                </label>
              </>
            )}
            {operation === 'convert_units' && (
              <>
                <label>
                  Measured value
                  <input name="value" type="number" step="any" defaultValue="1000" required />
                </label>
                <label>
                  Source unit
                  <input name="source_unit" defaultValue="watt" required />
                </label>
                <label>
                  Target unit
                  <input name="target_unit" defaultValue="kilowatt" required />
                </label>
              </>
            )}
            {operation === 'monte_carlo' &&
              [
                { name: 'upfront_cost', label: 'Upfront cost', value: 0 },
                { name: 'monthly_savings', label: 'Expected monthly savings', value: 0 },
                { name: 'monthly_running_cost', label: 'Monthly running cost', value: 0 },
                { name: 'savings_uncertainty', label: 'Savings standard deviation (%)', value: 20 },
                { name: 'months', label: 'Months', value: 24 },
              ].map((field) => (
                <label key={field.name}>
                  {field.label}
                  <input
                    name={field.name}
                    type="number"
                    min={field.name === 'months' ? 1 : 0}
                    max={field.name === 'months' ? 600 : field.name === 'savings_uncertainty' ? 100 : 1e12}
                    step={field.name === 'months' ? 1 : 'any'}
                    defaultValue={field.value}
                    required
                  />
                </label>
              ))}
          </div>
          <button disabled={busy}>{busy ? 'Computing…' : 'Run scientific operation ↗'}</button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="hint">
          Expressions support real variables, arithmetic, bounded numeric powers,
          sin/cos/tan/exp/log/sqrt/abs. Formal claims support linear real arithmetic only. Identity checks
          apply where both sides are defined. Statistical associations and numerical simulations do not
          establish causation or physical feasibility.
        </p>
      </div>
      {experiments.map((experiment) => (
        <section className="panel experiment" key={experiment.id}>
          <div className="section_heading">
            <h2>{operations[experiment.operation as keyof typeof operations] ?? experiment.operation}</h2>
            <span className="badge">EXECUTED TOOL</span>
          </div>
          <div className="result_grid">
            {Object.entries(experiment.result.result)
              .filter(
                ([key, value]) =>
                  !['latex', 'histogram', 'assumptions', 'inverse', 'eigenvalues'].includes(key) &&
                  (value === null || ['string', 'number', 'boolean'].includes(typeof value)),
              )
              .map(([key, value]) => (
                <div key={key}>
                  <small>{key.replaceAll('_', ' ')}</small>
                  <strong>{value === null ? 'Undefined' : String(value)}</strong>
                </div>
              ))}
          </div>
          {typeof experiment.result.result.latex === 'string' && (
            <MarkdownView content={'$$\n' + experiment.result.result.latex + '\n$$'} />
          )}
          {experiment.result.result.inverse && (
            <div className="table_wrapper">
              <h3>Inverse matrix</h3>
              <table>
                <tbody>
                  {experiment.result.result.inverse.map((row: string[], index: number) => (
                    <tr key={index}>
                      {row.map((value, index) => (
                        <td key={index}>{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {experiment.result.result.histogram && (
            <img
              className="chart"
              src={`/api/scientific/experiments/${experiment.id}/chart`}
              alt="Monte Carlo net benefit distribution"
            />
          )}
          <details>
            <summary>Inputs, full results and engine versions</summary>
            <pre className="receipt">
              {JSON.stringify({ input: experiment.input, ...experiment.result }, null, 2)}
            </pre>
          </details>
          <a href={`/api/scientific/experiments/${experiment.id}/json`}>Download computation receipt ↗</a>
        </section>
      ))}
    </section>
  );
}
