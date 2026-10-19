import { z } from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/index.js';
import { create_service, project_parameters, start_service, verify_project } from '../../shared/http.ts';
import { read_database_url } from '../../shared/configuration.ts';
import { generate_image } from './image_provider.ts';
import { diagram_input, draw_diagram } from './diagrams.ts';

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: read_database_url('visual') }, { schema: 'visual' }),
});
const server = create_service('visual');
server.get('/health', async () => {
  await database.$queryRaw`SELECT 1`;
  return { status: 'ok', service: 'visual' };
});
server.get('/status', async () => ({
  images_configured:
    Boolean(
      process.env.AZURE_IMAGE_ENDPOINT && process.env.AZURE_IMAGE_MODEL && process.env.RESEARCH_AZURE_KEY,
    ) && process.env.RESEARCH_MODEL_MODE !== 'simulation',
}));
server.get('/projects/:project_id/assets', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  return database.visual_asset.findMany({
    where: { project_id },
    orderBy: { created_at: 'desc' },
    select: { id: true, title: true, kind: true, state: true, error: true, mime_type: true },
  });
});
server.post('/projects/:project_id/diagrams', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  await verify_project(project_id);
  const input = diagram_input.parse(request.body);
  const content = Buffer.from(draw_diagram(input)).toString('base64');
  return database.visual_asset.create({
    data: {
      project_id,
      title: input.title,
      kind: 'diagram',
      state: 'completed',
      mime_type: 'image/svg+xml',
      content,
    },
  });
});
server.post('/projects/:project_id/images', async (request, reply) => {
  const { project_id } = project_parameters.parse(request.params);
  await verify_project(project_id);
  const input = z.object({ prompt: z.string().trim().min(1).max(4000) }).parse(request.body);
  if (
    process.env.RESEARCH_MODEL_MODE === 'simulation' ||
    !process.env.AZURE_IMAGE_ENDPOINT ||
    !process.env.AZURE_IMAGE_MODEL ||
    !process.env.RESEARCH_AZURE_KEY
  )
    return reply.code(503).send({
      error: 'Live image generation requires Azure image endpoint, model and key. Diagrams work locally.',
    });
  return reply.code(202).send(
    await database.visual_asset.create({
      data: {
        project_id,
        title: input.prompt.slice(0, 100),
        prompt: input.prompt,
        kind: 'image',
        state: 'queued',
        mime_type: 'image/png',
        content: '',
      },
      select: { id: true, state: true },
    }),
  );
});
server.get('/assets/:asset_id/content', async (request, reply) => {
  const { asset_id } = z.object({ asset_id: z.uuid() }).parse(request.params);
  const asset = await database.visual_asset.findUnique({ where: { id: asset_id } });
  if (!asset) return reply.code(404).send({ error: 'Visual not found' });
  if (asset.state !== 'completed') return reply.code(409).send({ error: 'Visual is not ready' });
  return reply
    .type(asset.mime_type)
    .header(
      'Content-Disposition',
      `inline; filename="research_visual.${asset.kind === 'diagram' ? 'svg' : 'png'}"`,
    )
    .send(Buffer.from(asset.content, 'base64'));
});
await database.visual_asset.updateMany({
  where: { state: 'running' },
  data: { state: 'failed', error: 'Image worker restarted; request a new image to retry.' },
});
let active = false;
const timer = setInterval(() => {
  if (active) return;
  active = true;
  void (async () => {
    const asset = await database.visual_asset.findFirst({
      where: { kind: 'image', state: 'queued' },
      orderBy: { created_at: 'asc' },
    });
    if (!asset) return;
    const claim = await database.visual_asset.updateMany({
      where: { id: asset.id, state: 'queued' },
      data: { state: 'running' },
    });
    if (!claim.count) return;
    try {
      const content = await generate_image(asset.prompt!);
      await database.visual_asset.update({ where: { id: asset.id }, data: { content, state: 'completed' } });
    } catch (error) {
      await database.visual_asset.update({
        where: { id: asset.id },
        data: { state: 'failed', error: error instanceof Error ? error.message : 'Image generation failed' },
      });
    }
  })()
    .catch((error) => server.log.error({ message: error.message }, 'Image worker failed'))
    .finally(() => {
      active = false;
    });
}, 1000);
server.addHook('onClose', async () => {
  clearInterval(timer);
  await database.$disconnect();
});
await start_service(server, 'visual');
