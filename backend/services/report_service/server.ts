import { z } from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/index.js';
import { create_service, project_parameters, start_service, call_service } from '../../shared/http.ts';
import { read_database_url, read_configuration, service_ports } from '../../shared/configuration.ts';
import { render_word, render_pdf, render_slides, rasterize_visual, type ReportVisual } from './renderers.ts';

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: read_database_url('report') }, { schema: 'report' }),
});
const server = create_service('report');
server.get('/health', async () => {
  await database.$queryRaw`SELECT 1`;
  return { status: 'ok', service: 'report' };
});
server.post('/reports', async (request) => {
  const input = z
    .object({
      project_id: z.uuid(),
      run_id: z.uuid(),
      title: z.string().max(160),
      content: z.string().max(1000000),
    })
    .parse(request.body);
  return database.report.upsert({ where: { run_id: input.run_id }, create: input, update: {} });
});
server.get('/projects/:project_id/reports', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  return database.report.findMany({
    where: { project_id },
    orderBy: { created_at: 'desc' },
    select: { id: true, title: true, run_id: true, created_at: true },
  });
});
let exports = 0;
server.get('/reports/:report_id/:format', async (request, reply) => {
  const { report_id, format } = z
    .object({ report_id: z.uuid(), format: z.enum(['md', 'docx', 'pdf', 'pptx']) })
    .parse(request.params);
  const report = await database.report.findUnique({ where: { id: report_id } });
  if (!report) return reply.code(404).send({ error: 'Report not found' });
  reply.header('Content-Disposition', `attachment; filename="research_report.${format}"`);
  if (format === 'md') return reply.type('text/markdown; charset=utf-8').send(report.content);
  if (exports >= 2)
    return reply.code(429).send({ error: 'Two exports are already rendering; retry shortly.' });
  exports++;
  try {
    const [scenarios, assets] = await Promise.all([
      call_service('analytics', `/projects/${report.project_id}/scenarios`),
      call_service('visual', `/projects/${report.project_id}/assets`),
    ]);
    const visuals: ReportVisual[] = [];
    for (const scenario of scenarios.slice(0, 2)) {
      const base = process.env.ANALYTICS_SERVICE_URL ?? `http://127.0.0.1:${service_ports.analytics}`;
      const response = await fetch(base + `/scenarios/${scenario.id}/chart`, {
        headers: { Authorization: `Bearer ${read_configuration('INTERNAL_SERVICE_TOKEN')}` },
      });
      if (response.ok)
        visuals.push({
          title: `Financial scenario: ${scenario.label} (user assumptions; current at export time)`,
          contents: Buffer.from(await response.arrayBuffer()),
          mime_type: 'image/svg+xml',
        });
    }
    for (const asset of assets.filter((asset: any) => asset.state === 'completed').slice(0, 2)) {
      const base = process.env.VISUAL_SERVICE_URL ?? `http://127.0.0.1:${service_ports.visual}`;
      const response = await fetch(base + `/assets/${asset.id}/content`, {
        headers: { Authorization: `Bearer ${read_configuration('INTERNAL_SERVICE_TOKEN')}` },
      });
      if (response.ok)
        visuals.push({
          title: `Project visual: ${asset.title} (current at export time)`,
          contents: Buffer.from(await response.arrayBuffer()),
          mime_type: response.headers.get('content-type')?.split(';')[0] ?? 'image/png',
        });
    }
    const images = [];
    for (const visual of visuals) images.push(await rasterize_visual(visual));
    if (format === 'docx')
      return reply
        .type('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        .send(await render_word(report.title, report.content, images));
    if (format === 'pdf')
      return reply.type('application/pdf').send(await render_pdf(report.title, report.content, images));
    return reply
      .type('application/vnd.openxmlformats-officedocument.presentationml.presentation')
      .send(await render_slides(report.title, report.content, images));
  } finally {
    exports--;
  }
});
await start_service(server, 'report');
