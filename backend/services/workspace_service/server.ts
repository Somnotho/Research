import { z } from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/index.js';
import { create_service, project_parameters, start_service } from '../../shared/http.ts';
import { read_database_url } from '../../shared/configuration.ts';

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: read_database_url('workspace') }, { schema: 'workspace' }),
});
const server = create_service('workspace');
server.get('/health', async () => {
  await database.$queryRaw`SELECT 1`;
  return { status: 'ok', service: 'workspace' };
});
server.get('/projects', async () => database.project.findMany({ orderBy: { created_at: 'desc' } }));
server.post('/projects', async (request) => {
  const input = z.object({ name: z.string().trim().min(1).max(160) }).parse(request.body);
  return database.project.create({ data: input });
});
server.get('/projects/:project_id', async (request, reply) => {
  const { project_id } = project_parameters.parse(request.params);
  const project = await database.project.findUnique({ where: { id: project_id } });
  return project ?? reply.code(404).send({ error: 'Project not found' });
});
server.put('/projects/:project_id/brief', async (request, reply) => {
  const { project_id } = project_parameters.parse(request.params);
  const brief = z
    .object({
      company: z.string().max(1000),
      problem: z.string().max(6000),
      current_system: z.string().max(6000),
      desired_outcome: z.string().max(3000),
      constraints: z.string().max(3000),
      competitors: z.string().max(3000),
      employee_impact: z.string().max(3000),
      success_metrics: z.string().max(3000),
    })
    .parse(request.body);
  if (!(await database.project.findUnique({ where: { id: project_id } })))
    return reply.code(404).send({ error: 'Project not found' });
  return database.project.update({ where: { id: project_id }, data: { brief } });
});
await start_service(server, 'workspace');
