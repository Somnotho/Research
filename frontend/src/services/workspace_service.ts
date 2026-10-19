import { request_json, submit_json } from './http_client';
export type Project = { id: string; name: string; created_at: string };
export const list_projects = () => request_json<Project[]>('/api/workspace/projects');
export const create_project = (name: string) => submit_json<Project>('/api/workspace/projects', { name });
