// UI boundary: analytics_service. Results are deterministic; evidence is supplied by the owner.
import { useEffect, useState } from 'react';
import {
  create_comparison,
  list_comparisons,
  type ImprovementComparison,
} from '../services/analytics_service';

export function ImprovementComparison({ project_id }: { project_id: string }) {
  const [comparisons, set_comparisons] = useState<ImprovementComparison[]>([]);
  const [measurement_count, set_measurement_count] = useState(1);
  const [error, set_error] = useState('');
  const [busy, set_busy] = useState(false);
  useEffect(() => {
    void list_comparisons(project_id)
      .then(set_comparisons)
      .catch((error) => set_error(error.message));
  }, [project_id]);
  async function submit_comparison(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    set_busy(true);
    set_error('');
    const values = new FormData(event.currentTarget);
    const read_number = (name: string) => Number(values.get(name));
    const read_text = (name: string) => String(values.get(name));
    try {
      await create_comparison(project_id, {
        label: read_text('comparison_label'),
        currency: read_text('comparison_currency').toUpperCase(),
        months: read_number('comparison_months'),
        annual_discount_rate: read_number('comparison_discount') / 100,
        upfront_cost: read_number('comparison_upfront'),
        baseline_monthly_cost: read_number('baseline_monthly_cost'),
        proposal_monthly_cost: read_number('proposal_monthly_cost'),
        baseline_monthly_revenue: read_number('baseline_monthly_revenue'),
        proposal_monthly_revenue: read_number('proposal_monthly_revenue'),
        financial_evidence: read_text('financial_evidence'),
        tradeoffs: read_text('tradeoffs'),
        measurements: Array.from({ length: measurement_count }, (_, index) => ({
          name: read_text(`metric_${index}`),
          unit: read_text(`unit_${index}`),
          baseline: read_number(`baseline_${index}`),
          proposal: read_number(`proposal_${index}`),
          direction: read_text(`direction_${index}`) as 'lower' | 'higher',
          evidence_status: read_text(`status_${index}`) as 'estimate' | 'observed',
          evidence_reference: read_text(`reference_${index}`),
        })),
      });
      set_comparisons(await list_comparisons(project_id));
    } catch (error) {
      set_error((error as Error).message);
    } finally {
      set_busy(false);
    }
  }
  const cost_fields = [
    ['baseline_monthly_cost', 'Current monthly operating cost', 0],
    ['proposal_monthly_cost', 'Proposed monthly operating cost', 0],
    ['baseline_monthly_revenue', 'Current monthly revenue', 0],
    ['proposal_monthly_revenue', 'Proposed monthly revenue', 0],
    ['comparison_upfront', 'Additional upfront investment', 0],
    ['comparison_months', 'Comparison horizon (months)', 24],
    ['comparison_discount', 'Comparison discount rate (%)', 10],
  ] as const;
  const format_number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return (
    <>
      <section className="panel">
        <span className="eyebrow">MAKE THE IMPROVEMENT MEASURABLE</span>
        <h2>Current state vs proposed solution</h2>
        <p className="intro">
          Compare the same business scope and period. Record cost, revenue, technical performance or employee
          workload with references to books, experiments or company records. Estimates remain estimates.
        </p>
        <form onSubmit={submit_comparison}>
          <div className="scenario_form">
            <label>
              Comparison name
              <input
                name="comparison_label"
                required
                maxLength={120}
                placeholder="e.g. Proposed infrastructure versus current system"
              />
            </label>
            <label>
              Comparison currency
              <input
                name="comparison_currency"
                required
                pattern="[A-Za-z]{3}"
                maxLength={3}
                defaultValue="ZAR"
              />
            </label>
            {cost_fields.map(([name, label, value]) => (
              <label key={name}>
                {label}
                <input
                  name={name}
                  type="number"
                  required
                  defaultValue={value}
                  min={name === 'comparison_months' ? 1 : 0}
                  max={name === 'comparison_months' ? 600 : name === 'comparison_discount' ? 100 : 1e12}
                  step={name === 'comparison_months' ? 1 : 'any'}
                />
              </label>
            ))}
          </div>
          <label>
            Financial evidence and assumptions
            <textarea
              name="financial_evidence"
              required
              maxLength={2000}
              placeholder="Source document/page, date, measurement scope, estimates and assumptions. Leave both revenues at zero for a cost-only comparison."
            />
          </label>
          {Array.from({ length: measurement_count }, (_, index) => (
            <fieldset key={index}>
              <legend>Success metric {index + 1}</legend>
              <div className="scenario_form">
                <label>
                  Metric name
                  <input
                    name={`metric_${index}`}
                    required
                    maxLength={100}
                    placeholder="e.g. Resolution time, stress score, throughput"
                  />
                </label>
                <label>
                  Unit
                  <input
                    name={`unit_${index}`}
                    required
                    maxLength={40}
                    placeholder="e.g. hours, score out of 10"
                  />
                </label>
                <label>
                  Current value
                  <input
                    name={`baseline_${index}`}
                    type="number"
                    required
                    step="any"
                    min={-1e12}
                    max={1e12}
                  />
                </label>
                <label>
                  Proposed value
                  <input
                    name={`proposal_${index}`}
                    type="number"
                    required
                    step="any"
                    min={-1e12}
                    max={1e12}
                  />
                </label>
                <label>
                  Better when
                  <select name={`direction_${index}`}>
                    <option value="lower">Lower</option>
                    <option value="higher">Higher</option>
                  </select>
                </label>
                <label>
                  Evidence status
                  <select name={`status_${index}`}>
                    <option value="estimate">Estimate / hypothesis</option>
                    <option value="observed">Owner-reported observation</option>
                  </select>
                </label>
              </div>
              <label>
                Evidence reference
                <input
                  name={`reference_${index}`}
                  required
                  maxLength={1000}
                  placeholder="Book and page / experiment ID / dated company dataset"
                />
              </label>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={measurement_count >= 20}
            onClick={() => set_measurement_count(measurement_count + 1)}
          >
            Add success metric
          </button>
          {measurement_count > 1 && (
            <button type="button" onClick={() => set_measurement_count(measurement_count - 1)}>
              Remove last metric
            </button>
          )}
          <label>
            Trade-offs, risks and validation plan
            <textarea
              name="tradeoffs"
              required
              maxLength={2000}
              placeholder="Where might the proposal be worse? What pilot, stress survey or physical test must validate it?"
            />
          </label>
          <button disabled={busy}>{busy ? 'Comparing…' : 'Save improvement comparison'}</button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <p className="hint">
          Incremental monthly benefit = current cost − proposed cost + proposed revenue − current revenue. NPV
          includes the upfront investment. No taxes, inflation or financing. A positive result depends on the
          supplied assumptions.
        </p>
      </section>
      {comparisons.map(({ id, label, result }) => (
        <section className="panel" key={id}>
          <div className="section_heading">
            <h2>{label}</h2>
            <span className="badge">OWNER-SUPPLIED EVIDENCE</span>
          </div>
          <div className="metrics">
            <div>
              <small>INCREMENTAL NET BENEFIT</small>
              <strong>
                {result.currency} {format_number(result.net_benefit)}
              </strong>
            </div>
            <div>
              <small>INCREMENTAL NPV</small>
              <strong>
                {result.currency} {format_number(result.net_present_value)}
              </strong>
            </div>
            <div>
              <small>PAYBACK</small>
              <strong>
                {result.payback_months === null
                  ? 'No payback'
                  : `${format_number(result.payback_months)} months`}
              </strong>
            </div>
          </div>
          <p>
            Cost over {result.months} months: current {result.currency}{' '}
            {format_number(result.baseline_total_cost)}; proposed {result.currency}{' '}
            {format_number(result.proposal_total_cost)} including upfront investment.
          </p>
          <div className="table_wrapper">
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Current</th>
                  <th>Proposed</th>
                  <th>Outcome</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {result.measurements.map((metric, index) => (
                  <tr key={index}>
                    <td>
                      {metric.name} ({metric.unit})
                    </td>
                    <td>{format_number(metric.baseline)}</td>
                    <td>{format_number(metric.proposal)}</td>
                    <td>
                      {metric.outcome} ·{' '}
                      {metric.improvement_percent === null
                        ? 'percentage undefined at zero baseline'
                        : `${format_number(metric.improvement_percent)}% improvement`}
                    </td>
                    <td>
                      {metric.evidence_status}: {metric.evidence_reference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <strong>Financial evidence:</strong> {result.financial_evidence}
          </p>
          <p>
            <strong>Trade-offs and validation:</strong> {result.tradeoffs}
          </p>
          <p className="hint">
            Financial outcome: {result.financial_outcome}. Payback may extend beyond the selected horizon.
            Owner-reported observations require verification. A favorable metric does not prove overall
            superiority.
          </p>
        </section>
      ))}
    </>
  );
}
