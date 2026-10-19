import { request_json } from './http_client';
export type ResearchDocument = { id: string; name: string; characters: number };
export const list_documents = (project_id: string) =>
  request_json<ResearchDocument[]>(`/api/knowledge/projects/${project_id}/documents`);
export function upload_document(project_id: string, document: File) {
  const form = new FormData();
  form.append('file', document);
  return request_json<ResearchDocument>(`/api/knowledge/projects/${project_id}/documents`, {
    method: 'POST',
    body: form,
  });
}
