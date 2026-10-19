import { z } from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/index.js';
import { create_service, project_parameters, start_service, verify_project } from '../../shared/http.ts';
import { read_configuration, read_database_url, service_ports } from '../../shared/configuration.ts';
import { download_source } from './retrieval.ts';
import { search_evidence } from './search.ts';

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: read_database_url('evidence') }, { schema: 'evidence' }),
});
const server = create_service('evidence');
server.get('/health', async () => {
  await database.$queryRaw`SELECT 1`;
  return { status: 'ok', service: 'evidence' };
});
server.post('/search', async (request) => {
  const { question } = z.object({ question: z.string().min(1).max(16000) }).parse(request.body);
  return search_evidence(question);
});
server.get('/projects/:project_id/sources', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  return database.web_source.findMany({ where: { project_id }, orderBy: { fetched_at: 'desc' }, take: 30 });
});
server.post('/projects/:project_id/sources', async (request, reply) => {
  const { project_id } = project_parameters.parse(request.params);
  const { url } = z.object({ url: z.url().max(2000) }).parse(request.body);
  await verify_project(project_id);
  try {
    const source = await download_source(url);
    const name = `${source.title.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 100) || 'web_source'}.${source.mime_type.includes('pdf') ? 'pdf' : 'txt'}`;
    const form = new FormData();
    form.append(
      'file',
      new Blob([
        new Uint8Array(source.mime_type.includes('pdf') ? source.contents : Buffer.from(source.text)),
      ]),
      name,
    );
    const base = process.env.KNOWLEDGE_SERVICE_URL ?? `http://127.0.0.1:${service_ports.knowledge}`;
    const response = await fetch(base + `/projects/${project_id}/documents`, {
      method: 'POST',
      body: form,
      headers: { Authorization: `Bearer ${read_configuration('INTERNAL_SERVICE_TOKEN')}` },
      signal: AbortSignal.timeout(100000),
    });
    if (!response.ok) throw new Error('Downloaded source could not be ingested into the document library');
    const document = await response.json();
    return database.web_source.create({
      data: {
        project_id,
        url: source.url,
        title: source.title,
        text: source.text,
        content_hash: source.content_hash,
        document_id: document.id,
      },
    });
  } catch (error) {
    return reply
      .code(422)
      .send({ error: error instanceof Error ? error.message : 'Source retrieval failed' });
  }
});
await start_service(server, 'evidence');
