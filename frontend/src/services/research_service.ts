import { request_json, submit_json } from './http_client';
export type Message = { id: string; role: string; content: string };
export type ResearchStep = { id: string; agent: string; state: string; detail: string; created_at: string };
export type ResearchRun = {
  id: string;
  question: string;
  state: string;
  error: string | null;
  report_id: string | null;
  steps?: ResearchStep[];
  plan?: { objective: string; tasks: { owner: string; task: string }[]; missing_inputs: string[] };
  usage?: {
    role: string;
    model: string;
    usage: { prompt_tokens: number; completion_tokens: number } | null;
  }[];
};
export type ModelStatus = {
  mode: 'simulation' | 'azure';
  configured: boolean;
  model: string | null;
  max_model_calls: number;
};
export const read_model_status = () => request_json<ModelStatus>('/api/research/status');
export const list_messages = (project_id: string) =>
  request_json<Message[]>(`/api/research/projects/${project_id}/messages`);
export const list_runs = (project_id: string) =>
  request_json<ResearchRun[]>(`/api/research/projects/${project_id}/runs`);
export const read_run = (run_id: string) => request_json<ResearchRun>(`/api/research/runs/${run_id}`);
export const start_research = (
  project_id: string,
  question: string,
  web_enabled: boolean,
  limits?: {
    max_tool_calls: number;
    max_duration_seconds: number;
    max_output_tokens: number;
    allow_code_execution?: boolean;
  },
) => submit_json<ResearchRun>(`/api/research/projects/${project_id}/runs`, { question, web_enabled, limits });
export const cancel_research = (run_id: string) =>
  submit_json<ResearchRun>(`/api/research/runs/${run_id}/cancel`, {});
