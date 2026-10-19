import { load_environment } from './environment.ts';
import { setGlobalProxyFromEnv } from 'node:http';

load_environment();

// Honor the cloud platform's authenticated HTTPS proxy without proxying local service calls.
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy) {
  const service_hosts = Object.entries(process.env)
    .filter(([name, value]) => name.endsWith('_SERVICE_URL') && value)
    .map(([, value]) => new URL(value!).hostname);
  const bypass_hosts = [
    process.env.NO_PROXY,
    process.env.no_proxy,
    'localhost',
    '127.0.0.1',
    '::1',
    ...service_hosts,
  ]
    .filter(Boolean)
    .join(',');
  setGlobalProxyFromEnv({ ...process.env, NO_PROXY: bypass_hosts, no_proxy: bypass_hosts });
}

export const service_ports = {
  gateway: 3000,
  workspace: 4101,
  knowledge: 4102,
  research: 4103,
  analytics: 4104,
  report: 4105,
  visual: 4106,
  scientific: 4107,
  evidence: 4108,
  execution: 4109,
  science_agent: 4201,
  commercial_agent: 4202,
  analytics_agent: 4203,
  reviewer_agent: 4204,
  director_agent: 4205,
  planner_agent: 4206,
} as const;
export type ServiceName = keyof typeof service_ports;

export function read_configuration(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}

export function read_database_url(service: string): string {
  return read_configuration(`${service.toUpperCase()}_DATABASE_URL`);
}
