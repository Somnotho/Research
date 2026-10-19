import { z } from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/index.js';
import { create_service, project_parameters, start_service, verify_project } from '../../shared/http.ts';
import { read_database_url } from '../../shared/configuration.ts';
import { read_model_status } from '../../shared/model_status.ts';
import { create_worker } from './worker.ts';
import { research_limits } from './planning.ts';

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: read_database_url('research') }, { schema: 'research' }),
});
const server = create_service('research');
server.get('/health', async () => {
  await database.$queryRaw`SELECT 1`;
  return { status: 'ok', service: 'research', ...read_model_status() };
});
server.get('/status', async () => ({
  ...read_model_status(),
  max_model_calls: 6,
  proactive_scope:
    'Persisted planning, evidence discovery, bounded scientific tools, specialist analyses, peer review and synthesis.',
}));
server.get('/projects/:project_id/messages', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  const messages = await database.message.findMany({
    where: { project_id },
    orderBy: { created_at: 'desc' },
    take: 300,
  });
  return messages.reverse();
});
server.get('/projects/:project_id/runs', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  return database.research_run.findMany({
    where: { project_id },
    orderBy: { created_at: 'desc' },
    take: 30,
    select: { id: true, state: true, question: true, created_at: true, error: true, report_id: true },
  });
});
server.post('/projects/:project_id/runs', async (request, reply) => {
  const { project_id } = project_parameters.parse(request.params);
  const input = z
    .object({
      question: z.string().trim().min(1).max(16000),
      web_enabled: z.boolean().default(false),
      limits: research_limits.default(() => research_limits.parse({})),
    })
    .parse(request.body);
  await verify_project(project_id);
  const status = read_model_status();
  if (status.mode !== 'simulation' && !status.configured)
    return reply
      .code(503)
      .send({ error: 'Azure is not configured. Add credentials or explicitly select local simulation.' });
  // A transaction-scoped lock prevents two browser tabs from overlapping a project conversation.
  const run = await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${project_id}))`;
    const pending = await transaction.research_run.findFirst({
      where: { project_id, state: { in: ['queued', 'running'] } },
    });
    if (pending)
      throw Object.assign(new Error('A research run is already active for this project'), {
        statusCode: 409,
      });
    const run = await transaction.research_run.create({ data: { project_id, ...input } });
    await transaction.message.create({ data: { project_id, role: 'user', content: input.question } });
    return run;
  });
  return reply.code(202).send(run);
});
server.get('/runs/:run_id', async (request, reply) => {
  const { run_id } = z.object({ run_id: z.uuid() }).parse(request.params);
  const run = await database.research_run.findUnique({ where: { id: run_id } });
  if (!run) return reply.code(404).send({ error: 'Run not found' });
  const steps = await database.research_step.findMany({ where: { run_id }, orderBy: { created_at: 'asc' } });
  return { ...run, steps };
});
// A restarted worker never silently repeats potentially paid model calls.
await database.research_run.updateMany({
  where: { state: 'running' },
  data: {
    state: 'failed',
    error:
      'Worker restarted during this run. Partial steps are retained; submit a new investigation to retry.',
  },
});
const worker = create_worker(database);
server.post('/runs/:run_id/cancel', async (request, reply) => {
  const { run_id } = z.object({ run_id: z.uuid() }).parse(request.params);
  const run = await database.research_run.findUnique({ where: { id: run_id } });
  if (!run) return reply.code(404).send({ error: 'Run not found' });
  const queued = await database.research_run.updateMany({
    where: { id: run_id, state: 'queued' },
    data: { cancel_requested: true, state: 'cancelled', completed_at: new Date() },
  });
  const running = queued.count
    ? null
    : await database.research_run.updateMany({
        where: { id: run_id, state: 'running' },
        data: { cancel_requested: true },
      });
  if (!queued.count && !running?.count) return reply.code(409).send({ error: 'Run has already stopped' });
  worker.cancel_run(run_id);
  return database.research_run.findUnique({ where: { id: run_id } });
});
const timer = setInterval(() => {
  void worker.poll_queue().catch((error) => server.log.error({ message: error.message }, 'Worker failed'));
}, 1000);
server.addHook('onClose', async () => {
  clearInterval(timer);
  await database.$disconnect();
});
await start_service(server, 'research');
