import { z } from 'zod';
import { create_service, start_service } from '../../shared/http.ts';
import { request_analysis, read_model_status } from './model_provider.ts';
import { agent_instructions } from './agent_contracts.ts';

// One role per process. The coordinator supplies evidence and a scoped task, not credentials.
const role = z
  .enum(['planner', 'science', 'commercial', 'analytics', 'reviewer', 'director'])
  .parse(process.env.AGENT_ROLE);
const service = `${role}_agent` as const;
const server = create_service(service);
server.get('/health', async () => ({ status: 'ok', service, ...read_model_status() }));
server.post('/analyze', async (request, reply) => {
  const input = z
    .object({
      task: z.string().min(1).max(8000),
      context: z.string().min(1).max(500000),
      max_output_tokens: z.number().int().min(500).max(4000).optional(),
    })
    .parse(request.body);
  const controller = new AbortController();
  reply.raw.on('close', () => {
    if (!reply.raw.writableEnded) controller.abort();
  });
  return request_analysis(role, agent_instructions + '\n' + input.task, input.context, {
    signal: controller.signal,
    max_output_tokens: input.max_output_tokens,
  });
});
await start_service(server, service);
