import { request_json, submit_json } from './http_client';
export type Experiment = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  result: { result: Record<string, any>; engine: Record<string, string> };
  created_at: string;
};
export const list_experiments = (project_id: string) =>
  request_json<Experiment[]>(`/api/scientific/projects/${project_id}/experiments`);
export const create_experiment = (project_id: string, input: unknown) =>
  submit_json<Experiment>(`/api/scientific/projects/${project_id}/experiments`, input);
