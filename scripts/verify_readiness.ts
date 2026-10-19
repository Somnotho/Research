import '../backend/shared/configuration.ts';
import { service_ports, read_configuration } from '../backend/shared/configuration.ts';

for (const [service, port] of Object.entries(service_ports)) {
  if (service === 'gateway') continue;
  const base = process.env[`${service.toUpperCase()}_SERVICE_URL`] ?? `http://127.0.0.1:${port}`;
  const response = await fetch(base + '/health', {
    headers: { Authorization: `Bearer ${read_configuration('INTERNAL_SERVICE_TOKEN')}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`${service} health check failed (HTTP ${response.status})`);
  const result = await response.json();
  if (result.status !== 'ok') throw new Error(`${service} did not report readiness`);
  console.log(`${service}: ready`);
}
const origin = read_configuration('PUBLIC_ORIGIN');
const homepage = await fetch(origin);
if (!homepage.ok || !(await homepage.text()).includes('Research Office'))
  throw new Error('Frontend is not served');
if ((await fetch(origin + '/api/workspace/projects')).status !== 401)
  throw new Error('Gateway must require owner login');
console.log('gateway: frontend served; private API requires authentication');
