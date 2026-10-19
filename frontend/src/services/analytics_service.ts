import { request_json, submit_json } from './http_client';
export type ScenarioInput = {
  label: string;
  currency: string;
  upfront_cost: number;
  monthly_savings: number;
  monthly_running_cost: number;
  months: number;
  annual_discount_rate: number;
};
export type Scenario = {
  id: string;
  label: string;
  result: ScenarioInput & {
    net_present_value: number;
    net_benefit: number;
    roi_percent: number | null;
    payback_months: number | null;
  };
};
export const list_scenarios = (project_id: string) =>
  request_json<Scenario[]>(`/api/analytics/projects/${project_id}/scenarios`);
export const create_scenario = (project_id: string, input: ScenarioInput) =>
  submit_json<Scenario>(`/api/analytics/projects/${project_id}/scenarios`, input);
export const read_chart_url = (scenario_id: string) => `/api/analytics/scenarios/${scenario_id}/chart`;

import type {
  ComparisonInput,
  calculate_comparison,
} from '../../../backend/services/analytics_service/comparisons';
export type ImprovementComparison = {
  id: string;
  label: string;
  result: ReturnType<typeof calculate_comparison>;
};
export const list_comparisons = (project_id: string) =>
  request_json<ImprovementComparison[]>(`/api/analytics/projects/${project_id}/comparisons`);
export const create_comparison = (project_id: string, input: ComparisonInput) =>
  submit_json<ImprovementComparison>(`/api/analytics/projects/${project_id}/comparisons`, input);
