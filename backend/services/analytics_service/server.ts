import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/index.js';
import { z } from 'zod';
import { create_service, project_parameters, start_service, verify_project } from '../../shared/http.ts';
import { read_database_url } from '../../shared/configuration.ts';
import { scenario_input, calculate_scenario, draw_cash_flow } from './calculations.ts';
import { comparison_input, calculate_comparison } from './comparisons.ts';
import { decision_input, calculate_decision } from './decisions.ts';

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: read_database_url('analytics') }, { schema: 'analytics' }),
});
const server = create_service('analytics');
server.get('/health', async () => {
  await database.$queryRaw`SELECT 1`;
  return { status: 'ok', service: 'analytics' };
});
server.get('/projects/:project_id/scenarios', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  return database.scenario.findMany({ where: { project_id }, orderBy: { created_at: 'desc' } });
});
server.post('/projects/:project_id/scenarios', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  await verify_project(project_id);
  const input = scenario_input.parse(request.body);
  const result = calculate_scenario(input);
  return database.scenario.create({ data: { project_id, label: input.label, result } });
});
server.get('/scenarios/:scenario_id/chart', async (request, reply) => {
  const { scenario_id } = z.object({ scenario_id: z.uuid() }).parse(request.params);
  const scenario = await database.scenario.findUnique({ where: { id: scenario_id } });
  if (!scenario) return reply.code(404).send({ error: 'Scenario not found' });
  return reply
    .type('image/svg+xml')
    .send(draw_cash_flow(scenario.result as ReturnType<typeof calculate_scenario>));
});
server.get('/projects/:project_id/decisions', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  return database.decision_matrix.findMany({
    where: { project_id },
    orderBy: { created_at: 'desc' },
    take: 10,
  });
});
server.post('/projects/:project_id/decisions', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  await verify_project(project_id);
  const input = decision_input.parse(request.body);
  return database.decision_matrix.create({
    data: { project_id, label: input.label, input, result: calculate_decision(input) },
  });
});
server.get('/projects/:project_id/comparisons', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  return database.improvement_comparison.findMany({
    where: { project_id },
    orderBy: { created_at: 'desc' },
    take: 20,
  });
});
server.post('/projects/:project_id/comparisons', async (request) => {
  const { project_id } = project_parameters.parse(request.params);
  await verify_project(project_id);
  const input = comparison_input.parse(request.body);
  return database.improvement_comparison.create({
    data: { project_id, label: input.label, result: calculate_comparison(input) },
  });
});
await start_service(server, 'analytics');
