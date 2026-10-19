import { z } from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from './generated/index.js';
import { create_service, project_parameters, start_service, verify_project } from '../../shared/http.ts';
import { read_database_url } from '../../shared/configuration.ts';
import { execution_input } from './contracts.ts';
import { execute_python, stop_executions } from './runner.ts';

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: read_database_url('execution') }, { schema: 'execution' }),
});
const server = create_service('execution');
server.get('/health', async () => {
  await database.$queryRaw`SELECT 1`;
  return { status: 'ok', service: 'execution' };
});
server.get('/projects/:project_id/tests', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  return database.code_test.findMany({ where: { project_id }, orderBy: { created_at: 'desc' }, take: 20 });
});
server.post('/projects/:project_id/tests', async (request, reply) => {
  const { project_id } = project_parameters.parse(request.params);
  await verify_project(project_id);
  const input = execution_input.parse(request.body);
  if ((await database.code_test.count({ where: { state: { in: ['queued', 'running'] } } })) >= 5)
    return reply.code(429).send({ error: 'Implementation queue is full; wait for existing jobs' });
  return reply.code(202).send(await database.code_test.create({ data: { project_id, input } }));
});
server.get('/tests/:test_id', async (request, reply) => {
  const { test_id } = z.object({ test_id: z.uuid() }).parse(request.params);
  return (
    (await database.code_test.findUnique({ where: { id: test_id } })) ??
    reply.code(404).send({ error: 'Test job not found' })
  );
});
server.post('/tests/:test_id/cancel', async (request, reply) => {
  const { test_id } = z.object({ test_id: z.uuid() }).parse(request.params);
  const job = await database.code_test.findUnique({ where: { id: test_id } });
  if (!job) return reply.code(404).send({ error: 'Test job not found' });
  const cancelled = await database.code_test.updateMany({
    where: { id: test_id, state: 'queued' },
    data: { state: 'cancelled' },
  });
  if (!cancelled.count)
    return reply
      .code(409)
      .send({ error: 'Only queued tests can be cancelled; running containers have a hard time limit' });
  return database.code_test.findUnique({ where: { id: test_id } });
});
await database.code_test.updateMany({
  where: { state: 'running' },
  data: { state: 'failed', result: { error: 'Worker restarted during execution; no automatic code retry' } },
});
let active = false;
const timer = setInterval(() => {
  if (active) return;
  active = true;
  void (async () => {
    const job = await database.code_test.findFirst({
      where: { state: 'queued' },
      orderBy: { created_at: 'asc' },
    });
    if (!job) return;
    const claim = await database.code_test.updateMany({
      where: { id: job.id, state: 'queued' },
      data: { state: 'running' },
    });
    if (!claim.count) return;
    try {
      const result = await execute_python(execution_input.parse(job.input));
      await database.code_test.update({
        where: { id: job.id },
        data: { state: result.passed ? 'completed' : 'failed', result: result as Prisma.InputJsonValue },
      });
    } catch (error) {
      await database.code_test.update({
        where: { id: job.id },
        data: {
          state: 'failed',
          result: { error: error instanceof Error ? error.message : 'Execution failed' },
        },
      });
    }
  })()
    .catch((error) => server.log.error({ message: error.message }, 'Execution worker failed'))
    .finally(() => {
      active = false;
    });
}, 500);
server.addHook('onClose', async () => {
  clearInterval(timer);
  await stop_executions();
  await database.$disconnect();
});
await start_service(server, 'execution');
