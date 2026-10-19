// UI boundary: analytics_service only. These are software calculations, independent of AI.
import { ImprovementComparison } from '../components/improvement_comparison';
import { DecisionMatrix } from '../components/decision_matrix';
import { useEffect, useState } from 'react';
import {
  create_scenario,
  list_scenarios,
  read_chart_url,
  type Scenario,
} from '../services/analytics_service';

export function AnalyticsPage({ project_id }: { project_id: string }) {
  const [scenarios, set_scenarios] = useState<Scenario[]>([]);
  const [error, set_error] = useState('');
  const [busy, set_busy] = useState(false);
  useEffect(() => {
    void list_scenarios(project_id)
      .then(set_scenarios)
      .catch((error) => set_error(error.message));
  }, [project_id]);
  async function submit_scenario(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    set_error('');
    set_busy(true);
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await create_scenario(project_id, {
        label: String(values.get('label')),
        currency: String(values.get('currency')).toUpperCase(),
        upfront_cost: Number(values.get('upfront_cost')),
        monthly_savings: Number(values.get('monthly_savings')),
        monthly_running_cost: Number(values.get('monthly_running_cost')),
        months: Number(values.get('months')),
        annual_discount_rate: Number(values.get('annual_discount_rate')) / 100,
      });
      set_scenarios(await list_scenarios(project_id));
    } catch (error) {
      set_error((error as Error).message);
    } finally {
      set_busy(false);
    }
  }
  const fields = [
    { name: 'upfront_cost', label: 'Upfront investment', value: 0, maximum: 1e12 },
    { name: 'monthly_savings', label: 'Expected monthly savings', value: 0, maximum: 1e12 },
    { name: 'monthly_running_cost', label: 'Monthly running cost', value: 0, maximum: 1e12 },
    { name: 'months', label: 'Time horizon (months)', value: 24, maximum: 600 },
    { name: 'annual_discount_rate', label: 'Annual discount rate (%)', value: 10, maximum: 100 },
  ];
  function format_money(value: number, currency: string) {
    return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return (
    <section>
      <ImprovementComparison project_id={project_id} />
      <div className="panel">
        <span className="eyebrow">MAKE THE ASSUMPTIONS VISIBLE</span>
        <h2>Commercial scenarios</h2>
        <p className="intro">
          Compare your estimates using repeatable calculations. Saved scenarios become evidence for your
          research team.
        </p>
        <form className="scenario_form" onSubmit={submit_scenario}>
          <label>
            Scenario name
            <input name="label" required maxLength={120} placeholder="e.g. Infrastructure pilot" />
          </label>
          <label>
            Currency code
            <input name="currency" required pattern="[A-Za-z]{3}" maxLength={3} defaultValue="ZAR" />
          </label>
          {fields.map((field) => (
            <label key={field.name}>
              {field.label}
              <input
                type="number"
                name={field.name}
                required
                min={field.name === 'months' ? 1 : 0}
                max={field.maximum}
                step={field.name === 'months' ? 1 : '0.01'}
                defaultValue={field.value}
              />
            </label>
          ))}
          <button disabled={busy}>{busy ? 'Calculating…' : 'Calculate & save scenario'}</button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="hint">
          Constant month-end cash flows. No inflation, taxes or financing costs. ROI = (total savings − total
          cost) / total cost. NPV discounts monthly cash flows using the annual rate. Inputs remain estimates.
        </p>
      </div>
      {scenarios.map((scenario) => (
        <section className="panel scenario" key={scenario.id}>
          <div className="section_heading">
            <h2>{scenario.label}</h2>
            <span className="badge">USER ASSUMPTIONS</span>
          </div>
          <div className="metrics">
            <div>
              <small>NET BENEFIT</small>
              <strong>{format_money(scenario.result.net_benefit, scenario.result.currency)}</strong>
            </div>
            <div>
              <small>NET PRESENT VALUE</small>
              <strong>{format_money(scenario.result.net_present_value, scenario.result.currency)}</strong>
            </div>
            <div>
              <small>RETURN ON COST</small>
              <strong>
                {scenario.result.roi_percent?.toFixed(1) ?? 'Undefined'}
                {scenario.result.roi_percent === null ? '' : '%'}
              </strong>
            </div>
            <div>
              <small>PAYBACK</small>
              <strong>
                {scenario.result.payback_months === null
                  ? 'No payback'
                  : scenario.result.payback_months.toFixed(1) + ' months'}
              </strong>
            </div>
          </div>
          <img
            className="chart"
            src={read_chart_url(scenario.id)}
            alt={`Cumulative cash flow for ${scenario.label}`}
          />
          <a href={read_chart_url(scenario.id)} download="cash_flow.svg">
            Download chart ↗
          </a>
        </section>
      ))}
      {scenarios.length > 1 && (
        <div className="panel table_wrapper">
          <h2>Options matrix</h2>
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Horizon</th>
                <th>Net benefit</th>
                <th>NPV</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => (
                <tr key={scenario.id}>
                  <td>{scenario.label}</td>
                  <td>{scenario.result.months} months</td>
                  <td>{format_money(scenario.result.net_benefit, scenario.result.currency)}</td>
                  <td>{format_money(scenario.result.net_present_value, scenario.result.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Compare scenarios with consistent currencies, horizons and assumptions.</p>
        </div>
      )}
      <DecisionMatrix project_id={project_id} />
    </section>
  );
}
