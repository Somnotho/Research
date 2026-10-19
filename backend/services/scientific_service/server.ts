import { z } from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from './generated/index.js';
import { create_service, project_parameters, start_service, verify_project } from '../../shared/http.ts';
import { read_database_url } from '../../shared/configuration.ts';
import { experiment_input } from './contracts.ts';
import { execute_experiment } from './executor.ts';

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: read_database_url('scientific') }, { schema: 'scientific' }),
});
const server = create_service('scientific');
let active = false;
const waiters: {
  fulfill: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}[] = [];
async function acquire_calculator() {
  if (!active) {
    active = true;
    return;
  }
  if (waiters.length >= 4)
    throw Object.assign(new Error('Scientific queue is full; retry shortly.'), { statusCode: 429 });
  await new Promise<void>((fulfill, reject) => {
    const entry = {
      fulfill,
      reject,
      timer: setTimeout(() => {
        const index = waiters.indexOf(entry);
        if (index >= 0) waiters.splice(index, 1);
        reject(
          Object.assign(new Error('Scientific queue wait exceeded five seconds; retry shortly.'), {
            statusCode: 429,
          }),
        );
      }, 5000),
    };
    waiters.push(entry);
  });
}
function release_calculator() {
  const entry = waiters.shift();
  if (entry) {
    clearTimeout(entry.timer);
    entry.fulfill();
  } else active = false;
}
server.get('/health', async () => {
  await database.$queryRaw`SELECT 1`;
  return { status: 'ok', service: 'scientific' };
});
server.get('/projects/:project_id/experiments', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  return database.experiment.findMany({ where: { project_id }, orderBy: { created_at: 'desc' }, take: 30 });
});
server.post('/projects/:project_id/experiments', async (request, reply) => {
  const { project_id } = project_parameters.parse(request.params);
  const input = experiment_input.parse(request.body);
  await verify_project(project_id);
  await acquire_calculator();
  try {
    const result = await execute_experiment(input);
    return await database.experiment.create({
      data: {
        project_id,
        operation: input.operation,
        input: input as Prisma.InputJsonValue,
        result: result as Prisma.InputJsonValue,
      },
    });
  } finally {
    release_calculator();
  }
});
server.get('/experiments/:experiment_id/json', async (request, reply) => {
  const { experiment_id } = z.object({ experiment_id: z.uuid() }).parse(request.params);
  const experiment = await database.experiment.findUnique({ where: { id: experiment_id } });
  if (!experiment) return reply.code(404).send({ error: 'Experiment not found' });
  return reply.header('Content-Disposition', 'attachment; filename="experiment.json"').send(experiment);
});
server.get('/experiments/:experiment_id/chart', async (request, reply) => {
  const { experiment_id } = z.object({ experiment_id: z.uuid() }).parse(request.params);
  const experiment = await database.experiment.findUnique({ where: { id: experiment_id } });
  const result = experiment?.result as
    { result?: { histogram?: { counts: number[]; edges: number[] } } } | undefined;
  const histogram = result?.result?.histogram;
  if (!histogram) return reply.code(404).send({ error: 'This experiment has no distribution chart' });
  const peak = Math.max(1, ...histogram.counts);
  const bars = histogram.counts
    .map(
      (count, index) =>
        `<rect x="${55 + index * 24}" y="${225 - (count / peak) * 170}" width="21" height="${(count / peak) * 170}" fill="#39744f"/>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 280"><rect width="600" height="280" fill="#f4f6ef"/><text x="30" y="28" font-family="sans-serif" font-size="16">Monte Carlo: net benefit distribution</text>${bars}<text x="55" y="250" font-family="sans-serif" font-size="11">${histogram.edges[0].toFixed(0)}</text><text x="465" y="250" font-family="sans-serif" font-size="11">${histogram.edges.at(-1)!.toFixed(0)}</text></svg>`;
  return reply.type('image/svg+xml').send(svg);
});
await start_service(server, 'scientific');
