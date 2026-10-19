import multipart from '@fastify/multipart';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/index.js';
import { create_service, project_parameters, start_service, verify_project } from '../../shared/http.ts';
import { read_database_url } from '../../shared/configuration.ts';
import { extract_document, select_excerpts, document_query } from './documents.ts';

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: read_database_url('knowledge') }, { schema: 'knowledge' }),
});
const server = create_service('knowledge');
await server.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0 } });
server.get('/health', async () => {
  await database.$queryRaw`SELECT 1`;
  return { status: 'ok', service: 'knowledge' };
});
server.get('/projects/:project_id/documents', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  return database.document.findMany({
    where: { project_id },
    select: { id: true, name: true, characters: true, version: true, content_hash: true, created_at: true },
  });
});
server.post('/projects/:project_id/documents', async (request, reply) => {
  const { project_id } = project_parameters.parse(request.params);
  await verify_project(project_id);
  const upload = await request.file();
  if (!upload) return reply.code(400).send({ error: 'Choose one document' });
  const contents = await upload.toBuffer();
  const name = basename(upload.filename);
  let text: string;
  try {
    text = await extract_document(name, contents);
  } catch (error) {
    return reply
      .code(422)
      .send({ error: error instanceof Error ? error.message : 'Document extraction failed' });
  }
  const content_hash = createHash('sha256').update(contents).digest('hex');
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${project_id + name}))`;
    const duplicate = await transaction.document.findFirst({
      where: { project_id, name, content_hash },
      select: { id: true, name: true, characters: true, version: true },
    });
    if (duplicate) return { ...duplicate, duplicate: true };
    const previous = await transaction.document.findFirst({
      where: { project_id, name },
      orderBy: { version: 'desc' },
    });
    return transaction.document.create({
      data: {
        project_id,
        name,
        text,
        content_hash,
        original: new Uint8Array(contents),
        mime_type: upload.mimetype,
        version: (previous?.version ?? 0) + 1,
        characters: text.length,
      },
      select: { id: true, name: true, characters: true, version: true },
    });
  });
});
server.post('/projects/:project_id/excerpts', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  const { question } = document_query.parse(request.body);
  const versions = await database.document.findMany({
    where: { project_id },
    select: { id: true, name: true, text: true, version: true },
    orderBy: { version: 'desc' },
  });
  const documents = versions.filter(
    (document, index) => versions.findIndex((item) => item.name === document.name) === index,
  );
  return {
    excerpts: select_excerpts(documents, question),
    method:
      'Ranked excerpts from the latest document versions, with page markers and source offsets. Not an exhaustive reading.',
  };
});
server.get('/documents/:document_id/original', async (request, reply) => {
  const { document_id } = z.object({ document_id: z.uuid() }).parse(request.params);
  const document = await database.document.findUnique({ where: { id: document_id } });
  if (!document) return reply.code(404).send({ error: 'Document not found' });
  reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`);
  return reply
    .type(document.mime_type)
    .send(document.original ? Buffer.from(document.original) : Buffer.from(document.text));
});
server.delete('/documents/:document_id', async (request, reply) => {
  const { document_id } = z.object({ document_id: z.uuid() }).parse(request.params);
  const result = await database.document.deleteMany({ where: { id: document_id } });
  return result.count ? { deleted: true } : reply.code(404).send({ error: 'Document not found' });
});
await start_service(server, 'knowledge');
