import test from 'node:test';
import assert from 'node:assert/strict';
import { comparison_input, calculate_comparison } from '../backend/services/analytics_service/comparisons.ts';
import { compose_comparison_report } from '../backend/services/research_service/comparison_report.ts';
import { calculate_scenario } from '../backend/services/analytics_service/calculations.ts';

const input = comparison_input.parse({
  label: 'Infrastructure pilot',
  months: 12,
  upfront_cost: 1200,
  annual_discount_rate: 0,
  baseline_monthly_cost: 1000,
  proposal_monthly_cost: 800,
  financial_evidence: 'Company estimate; book p.42 provides mechanism, not commercial proof',
  tradeoffs: 'Pilot required; employee workload may increase',
  measurements: [
    {
      name: 'Latency',
      unit: 'ms',
      baseline: 100,
      proposal: 80,
      direction: 'lower',
      evidence_status: 'estimate',
      evidence_reference: 'Book p.42 / experiment pending',
    },
    {
      name: 'Stress',
      unit: 'score /10',
      baseline: 3,
      proposal: 6,
      direction: 'lower',
      evidence_status: 'estimate',
      evidence_reference: 'Hypothesis; survey pending',
    },
  ],
});
test('compares costs, incremental cash flow and both improving and worsening metrics', () => {
  const result = calculate_comparison(input);
  assert.equal(result.monthly_benefit, 200);
  assert.equal(result.baseline_total_cost, 12000);
  assert.equal(result.proposal_total_cost, 10800);
  assert.equal(result.net_benefit, 1200);
  assert.equal(result.net_present_value, 1200);
  assert.equal(result.return_on_upfront_percent, 100);
  assert.equal(result.payback_months, 6);
  assert.equal(result.measurements[0].outcome, 'improves');
  assert.equal(result.measurements[0].improvement_percent, 20);
  assert.equal(result.measurements[1].outcome, 'worsens');
  assert.equal(result.measurements[1].improvement_percent, -100);
  assert.equal(result.measurements[0].evidence_status, 'estimate');
});
test('discounts incremental revenues as well as cost reductions; handles loss and zero baseline', () => {
  const loss = calculate_comparison({
    ...input,
    upfront_cost: 0,
    proposal_monthly_cost: 1200,
    months: 1,
    annual_discount_rate: 0.12,
    baseline_monthly_revenue: 100,
    proposal_monthly_revenue: 50,
  });
  assert.equal(loss.monthly_benefit, -250);
  assert.ok(Math.abs(loss.net_present_value - -250 / 1.12 ** (1 / 12)) < 1e-8);
  assert.equal(loss.financial_outcome, 'negative');
  assert.equal(loss.payback_months, null);
  assert.equal(loss.return_on_upfront_percent, null);
  const zero = calculate_comparison({ ...input, measurements: [{ ...input.measurements[0], baseline: 0 }] });
  assert.equal(zero.measurements[0].improvement_percent, null);
  assert.equal(zero.measurements[0].outcome, 'worsens');
  assert.equal(comparison_input.safeParse({ ...input, financial_evidence: '' }).success, false);
});
test('exports references, unfavorable results and limitations rather than claiming proven superiority', () => {
  const report = compose_comparison_report([
    { id: 'snapshot-id', label: 'A | B <script>', result: calculate_comparison(input) },
  ]);
  assert.match(report, /worsens/);
  assert.match(report, /Book p.42/);
  assert.match(report, /estimates are not measured improvements/);
  assert.match(report, /A &#124; B &lt;script&gt;/);
  assert.match(compose_comparison_report([]), /improvement is not established/);
});
test('zero investment with ongoing losses never claims immediate payback', () => {
  assert.equal(
    calculate_scenario({
      label: 'Loss',
      currency: 'ZAR',
      upfront_cost: 0,
      monthly_savings: 0,
      monthly_running_cost: 1,
      months: 12,
      annual_discount_rate: 0,
    }).payback_months,
    null,
  );
});
