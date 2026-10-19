import { request_json, submit_json } from './http_client';
export type VisualAsset = { id: string; title: string; kind: string; state: string; error: string | null };
export const list_assets = (project_id: string) =>
  request_json<VisualAsset[]>(`/api/visual/projects/${project_id}/assets`);
export const read_visual_status = () => request_json<{ images_configured: boolean }>('/api/visual/status');
export const create_diagram = (project_id: string, title: string, nodes: string[]) =>
  submit_json(`/api/visual/projects/${project_id}/diagrams`, { title, nodes });
export const create_image = (project_id: string, prompt: string) =>
  submit_json(`/api/visual/projects/${project_id}/images`, { prompt });
export const read_asset_url = (asset_id: string) => `/api/visual/assets/${asset_id}/content`;
