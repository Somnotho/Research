import { z } from 'zod';
import { read_configuration, service_ports } from '../../shared/configuration.ts';

const analysis_result = z.object({
  text: z.string().min(1),
  model: z.string(),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullable(),
});

export async function consult_agent(
  role: 'planner' | 'science' | 'commercial' | 'analytics' | 'reviewer' | 'director',
  task: string,
  context: string,
  options: { signal?: AbortSignal; max_output_tokens?: number } = {},
) {
  const service = `${role}_agent` as const;
  const base =
    process.env[`${service.toUpperCase()}_SERVICE_URL`] ?? `http://127.0.0.1:${service_ports[service]}`;
  const response = await fetch(base + '/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${read_configuration('INTERNAL_SERVICE_TOKEN')}`,
    },
    body: JSON.stringify({ task, context, max_output_tokens: options.max_output_tokens }),
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(200000)])
      : AbortSignal.timeout(200000),
  });
  if (!response.ok)
    throw new Error(
      `${role} agent returned HTTP ${response.status}; inspect its service log for provider configuration or quota errors.`,
    );
  return analysis_result.parse(await response.json());
}
