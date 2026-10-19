import { z } from 'zod';

const measurement_input = z.object({
  name: z.string().trim().min(1).max(100),
  unit: z.string().trim().min(1).max(40),
  baseline: z.number().finite().min(-1e12).max(1e12),
  proposal: z.number().finite().min(-1e12).max(1e12),
  direction: z.enum(['lower', 'higher']),
  evidence_status: z.enum(['estimate', 'observed']),
  evidence_reference: z.string().trim().min(1).max(1000),
});
export const comparison_input = z.object({
  label: z.string().trim().min(1).max(120),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('ZAR'),
  months: z.number().int().min(1).max(600),
  annual_discount_rate: z.number().finite().min(0).max(1).default(0.1),
  upfront_cost: z.number().finite().min(0).max(1e12),
  baseline_monthly_cost: z.number().finite().min(0).max(1e12),
  proposal_monthly_cost: z.number().finite().min(0).max(1e12),
  baseline_monthly_revenue: z.number().finite().min(0).max(1e12).default(0),
  proposal_monthly_revenue: z.number().finite().min(0).max(1e12).default(0),
  financial_evidence: z.string().trim().min(1).max(2000),
  tradeoffs: z.string().trim().min(1).max(2000),
  measurements: z.array(measurement_input).min(1).max(20),
});
export type ComparisonInput = z.infer<typeof comparison_input>;

export function calculate_comparison(input: ComparisonInput) {
  const monthly_cost_reduction = input.baseline_monthly_cost - input.proposal_monthly_cost;
  const monthly_revenue_increase = input.proposal_monthly_revenue - input.baseline_monthly_revenue;
  const monthly_benefit = monthly_cost_reduction + monthly_revenue_increase;
  const monthly_rate = (1 + input.annual_discount_rate) ** (1 / 12) - 1;
  const net_benefit = monthly_benefit * input.months - input.upfront_cost;
  const net_present_value = Array.from(
    { length: input.months },
    (_, index) => monthly_benefit / (1 + monthly_rate) ** (index + 1),
  ).reduce((total, value) => total + value, -input.upfront_cost);
  const measurements = input.measurements.map((measurement) => {
    const change = measurement.proposal - measurement.baseline;
    const improvement = change * (measurement.direction === 'higher' ? 1 : -1);
    return {
      ...measurement,
      change,
      improvement_percent:
        measurement.baseline === 0 ? null : (improvement / Math.abs(measurement.baseline)) * 100,
      outcome: improvement > 0 ? 'improves' : improvement < 0 ? 'worsens' : 'unchanged',
    };
  });
  return {
    ...input,
    measurements,
    monthly_cost_reduction,
    monthly_revenue_increase,
    monthly_benefit,
    net_benefit,
    net_present_value,
    baseline_total_cost: input.baseline_monthly_cost * input.months,
    proposal_total_cost: input.proposal_monthly_cost * input.months + input.upfront_cost,
    return_on_upfront_percent: input.upfront_cost > 0 ? (net_benefit / input.upfront_cost) * 100 : null,
    payback_months: monthly_benefit > 0 ? input.upfront_cost / monthly_benefit : null,
    financial_outcome: net_present_value > 0 ? 'positive' : net_present_value < 0 ? 'negative' : 'break_even',
    limitations: [
      'Matched scope, currency, time period and measurement method are required for a fair comparison.',
      'Evidence references and observed/estimate labels are supplied by the owner; not independently verified.',
      'No taxes, financing or inflation; constant month-end cash flows and an effective monthly discount rate.',
      'Do not count cost reductions again as revenue increases. Return on upfront uses net incremental cash flow.',
      'An improving metric or positive NPV does not establish overall superiority or scientific causation.',
    ],
  };
}
