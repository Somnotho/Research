import { z } from 'zod';

export const scenario_input = z.object({
  label: z.string().trim().min(1).max(120),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('ZAR'),
  upfront_cost: z.number().finite().min(0).max(1e12),
  monthly_savings: z.number().finite().min(0).max(1e12),
  monthly_running_cost: z.number().finite().min(0).max(1e12),
  months: z.number().int().min(1).max(600),
  annual_discount_rate: z.number().finite().min(0).max(1).default(0.1),
});
export type ScenarioInput = z.infer<typeof scenario_input>;

export function calculate_scenario(input: ScenarioInput) {
  const monthly_benefit = input.monthly_savings - input.monthly_running_cost;
  const total_cost = input.upfront_cost + input.monthly_running_cost * input.months;
  const total_savings = input.monthly_savings * input.months;
  const net_benefit = total_savings - total_cost;
  const monthly_discount_rate = (1 + input.annual_discount_rate) ** (1 / 12) - 1;
  const cash_flows = Array.from({ length: input.months + 1 }, (_, month) => ({
    month,
    cumulative_cash: -input.upfront_cost + month * monthly_benefit,
  }));
  const net_present_value =
    -input.upfront_cost +
    cash_flows
      .slice(1)
      .reduce((sum, row) => sum + monthly_benefit / (1 + monthly_discount_rate) ** row.month, 0);
  return {
    ...input,
    monthly_benefit,
    total_cost,
    total_savings,
    net_benefit,
    net_present_value,
    roi_percent: total_cost > 0 ? (net_benefit / total_cost) * 100 : null,
    payback_months: monthly_benefit > 0 ? input.upfront_cost / monthly_benefit : null,
    cash_flows,
    assumptions: [
      'Constant monthly savings and running costs',
      'No taxes, inflation or financing costs',
      'Cash flows occur at month end',
      'Inputs are user estimates, not independently verified company figures',
    ],
  };
}

export function draw_cash_flow(input: ReturnType<typeof calculate_scenario>): string {
  const rows = input.cash_flows;
  const minimum = Math.min(0, ...rows.map((row) => row.cumulative_cash));
  const maximum = Math.max(1, ...rows.map((row) => row.cumulative_cash));
  const y = (value: number) => 210 - ((value - minimum) / (maximum - minimum)) * 170;
  const points = rows
    .map((row) => `${60 + (row.month / input.months) * 480},${y(row.cumulative_cash)}`)
    .join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 270" role="img" aria-label="Cumulative cash flow"><rect width="600" height="270" fill="#f4f5f1"/><text x="30" y="26" font-family="sans-serif" font-size="15">Cumulative cash flow (${input.currency})</text><path d="M60 45V215H550" fill="none" stroke="#8c9c8f"/><path d="M60 ${y(0)}H550" stroke="#b8c7ba" stroke-dasharray="4"/><polyline points="${points}" fill="none" stroke="#24634f" stroke-width="3"/><text x="60" y="240" font-family="sans-serif" font-size="12">Month 0</text><text x="480" y="240" font-family="sans-serif" font-size="12">Month ${input.months}</text><text x="65" y="58" font-family="sans-serif" font-size="11">Range: ${minimum.toFixed(0)} to ${maximum.toFixed(0)}</text></svg>`;
}
