import { request_json } from './http_client';
export type ResearchReport = { id: string; title: string; created_at: string };
export const list_reports = (project_id: string) =>
  request_json<ResearchReport[]>(`/api/report/projects/${project_id}/reports`);
export const read_report_url = (report_id: string, format: 'md' | 'docx' | 'pdf' | 'pptx') =>
  `/api/report/reports/${report_id}/${format}`;
