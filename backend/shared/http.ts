import Fastify from 'fastify';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { read_configuration, service_ports, type ServiceName } from './configuration.ts';

export function compare_secrets(first: string, second: string): boolean {
  const first_buffer = Buffer.from(first);
  const second_buffer = Buffer.from(second);
  return first_buffer.length === second_buffer.length && timingSafeEqual(first_buffer, second_buffer);
}

export function create_service(name: Exclude<ServiceName, 'gateway'>) {
  const server = Fastify({
    logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] },
    disableRequestLogging: true,
    bodyLimit: 21 * 1024 * 1024,
  });
  const token = read_configuration('INTERNAL_SERVICE_TOKEN');
  server.addHook('onRequest', async (request, reply) => {
    if (!compare_secrets(request.headers.authorization ?? '', `Bearer ${token}`)) {
      await reply.code(401).send({ error: 'Service authentication required' });
    }
  });
  server.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({ error: 'Invalid request', issues: error.issues });
    const message = error instanceof Error ? error.message : 'Unknown service error';
    request.log.error({ message }, 'Service request failed');
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({
      error: status < 500 ? message : 'Service operation failed; check service logs and configuration.',
    });
  });
  return server;
}

export async function call_service(
  service: Exclude<ServiceName, 'gateway'>,
  path: string,
  options: RequestInit = {},
) {
  const url =
    process.env[`${service.toUpperCase()}_SERVICE_URL`] ?? `http://127.0.0.1:${service_ports[service]}`;
  const response = await fetch(url + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      Authorization: `Bearer ${read_configuration('INTERNAL_SERVICE_TOKEN')}`,
    },
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`${service} service returned HTTP ${response.status}`);
  return response.json();
}

export async function verify_project(project_id: string): Promise<void> {
  await call_service('workspace', `/projects/${project_id}`);
}

export async function start_service(
  server: ReturnType<typeof create_service>,
  name: Exclude<ServiceName, 'gateway'>,
) {
  let closing = false;
  const close_service = () => {
    if (closing) return;
    closing = true;
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', close_service);
  process.on('SIGINT', close_service);
  await server.listen({
    port: Number(process.env.PORT ?? service_ports[name]),
    host: process.env.SERVICE_HOST ?? '127.0.0.1',
  });
}

export const project_parameters = z.object({ project_id: z.uuid() });
