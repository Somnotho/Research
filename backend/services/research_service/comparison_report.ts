import type { calculate_comparison } from '../analytics_service/comparisons.ts';

type Comparison = { id: string; label: string; result: ReturnType<typeof calculate_comparison> };
const escape_cell = (value: unknown) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '&#124;')
    .replace(/\r?\n/g, ' ');
const format_number = (value: number) => value.toLocaleString('en-ZA', { maximumFractionDigits: 2 });

// Generated from the exact persisted inputs supplied to this run, independent of model prose.
export function compose_comparison_report(comparisons: Comparison[]) {
  if (!comparisons.length)
    return '## Baseline comparison\n\nNo structured current-state comparison was supplied for this investigation. Quantified improvement is not established. Add a comparison in Analytics and start a new investigation.\n\n';
  return (
    '## Baseline and proposed outcomes\n\nThese calculations snapshot the comparisons available when this investigation started. Inputs and evidence labels are owner-supplied; estimates are not measured improvements.\n\n' +
    comparisons
      .map(({ id, label, result }) => {
        const money = (value: number) => `${result.currency} ${format_number(value)}`;
        return (
          `### ${escape_cell(label)}\n\nComparison ID: ${id}. Horizon: ${result.months} months. Annual discount rate: ${format_number(result.annual_discount_rate * 100)}%.\n\n` +
          '| Financial measure | Current state | Proposed solution |\n|---|---:|---:|\n' +
          `| Monthly operating cost | ${money(result.baseline_monthly_cost)} | ${money(result.proposal_monthly_cost)} |\n` +
          `| Monthly revenue | ${money(result.baseline_monthly_revenue)} | ${money(result.proposal_monthly_revenue)} |\n` +
          `| Total operating cost plus new investment | ${money(result.baseline_total_cost)} | ${money(result.proposal_total_cost)} |\n\n` +
          `**Incremental monthly benefit:** ${money(result.monthly_benefit)}. **Net benefit over horizon:** ${money(result.net_benefit)}. **NPV:** ${money(result.net_present_value)} (${result.financial_outcome}). **Simple payback:** ${result.payback_months === null ? 'none' : format_number(result.payback_months) + ' months; may exceed the horizon'}. **Return on upfront investment:** ${result.return_on_upfront_percent === null ? 'undefined with zero investment' : format_number(result.return_on_upfront_percent) + '%'}.\n\n` +
          '| Success metric | Current | Proposed | Outcome | Evidence status / reference |\n|---|---:|---:|---|---|\n' +
          result.measurements
            .map(
              (metric) =>
                `| ${escape_cell(metric.name)} (${escape_cell(metric.unit)}; ${metric.direction} is better) | ${format_number(metric.baseline)} | ${format_number(metric.proposal)} | ${metric.outcome}; ${metric.improvement_percent === null ? 'percentage undefined at zero baseline' : format_number(metric.improvement_percent) + '% improvement'} | ${escape_cell(metric.evidence_status)}: ${escape_cell(metric.evidence_reference)} |`,
            )
            .join('\n') +
          `\n\n**Financial evidence and assumptions:** ${escape_cell(result.financial_evidence)}\n\n**Trade-offs and validation plan:** ${escape_cell(result.tradeoffs)}\n\n` +
          result.limitations.map((limitation) => `- ${limitation}`).join('\n') +
          '\n\n'
        );
      })
      .join('\n')
  );
}
