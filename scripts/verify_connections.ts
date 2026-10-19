import '../backend/shared/configuration.ts';
import { Client } from 'pg';
import { read_configuration, read_database_url } from '../backend/shared/configuration.ts';
import { request_analysis } from '../backend/services/agent_service/model_provider.ts';

const services = [
  'workspace',
  'knowledge',
  'research',
  'analytics',
  'report',
  'scientific',
  'evidence',
  'execution',
  'visual',
];
let failures = 0;
function report_failure(component: string, message: string) {
  failures++;
  console.error(`${component}: ${message}`);
}
for (const [name, minimum] of [
  ['OWNER_PASSWORD', 14],
  ['SESSION_SECRET', 32],
  ['INTERNAL_SERVICE_TOKEN', 32],
] as const) {
  if ((process.env[name]?.length ?? 0) < minimum)
    report_failure(name, `must contain at least ${minimum} characters; run setup or supply a secure value.`);
}
try {
  const origin = new URL(read_configuration('PUBLIC_ORIGIN'));
  if (origin.origin !== process.env.PUBLIC_ORIGIN || !['http:', 'https:'].includes(origin.protocol))
    throw new Error();
  if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error();
  console.log('PUBLIC_ORIGIN: valid exact origin');
} catch {
  report_failure(
    'PUBLIC_ORIGIN',
    'use an exact http(s) origin without a path or trailing slash; production requires HTTPS.',
  );
}
await Promise.all(
  services.map(async (service) => {
    let database: Client | undefined;
    try {
      const connection_string = read_database_url(service);
      const url = new URL(connection_string);
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('url');
      if (url.searchParams.get('sslmode') === 'no-verify') throw new Error('tls');
      database = new Client({
        connectionString: connection_string,
        connectionTimeoutMillis: 10000,
        query_timeout: 10000,
      });
      await database.connect();
      const result = await database.query('SELECT has_schema_privilege(current_user, $1, $2) AS allowed', [
        service,
        'USAGE',
      ]);
      if (!result.rows[0]?.allowed) throw new Error('schema');
      console.log(`${service}: database connected; owned schema accessible`);
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      report_failure(
        service,
        `database check failed${code ? ` (${code})` : ''}. Check its DATABASE_URL, TLS trust, network route, schema permissions and migrations. For local mode, start npm run dev first. No credentials were logged.`,
      );
    } finally {
      await database?.end().catch(() => {});
    }
  }),
);
if (process.env.RESEARCH_MODEL_MODE === 'simulation') {
  console.log(
    'Azure: simulation selected; no provider requests made. Set RESEARCH_MODEL_MODE=azure for live AI.',
  );
} else if (process.env.RESEARCH_MODEL_MODE !== 'azure') {
  report_failure('RESEARCH_MODEL_MODE', 'choose simulation or azure.');
} else {
  let endpoint_valid = false;
  try {
    const endpoint = new URL(read_configuration('AZURE_AI_ENDPOINT'));
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error();
    endpoint_valid = true;
  } catch {
    report_failure('Azure', 'supply a valid HTTPS base endpoint, without query, credentials or fragment.');
  }
  for (const role of ['planner', 'science', 'commercial', 'analytics', 'reviewer', 'director']) {
    if (
      !process.env.RESEARCH_AZURE_KEY ||
      !(process.env[`AZURE_${role.toUpperCase()}_MODEL`] || process.env.AZURE_AI_MODEL)
    ) {
      report_failure(`Azure ${role}`, 'deployment or RESEARCH_AZURE_KEY missing.');
      continue;
    }
    if (endpoint_valid && process.argv.includes('--probe-models')) {
      try {
        const result = await request_analysis(
          role,
          'This is a connection check. Reply only: connected',
          'No company data is included.',
          { max_output_tokens: 500, signal: AbortSignal.timeout(45000) },
        );
        if (!result.text.trim()) throw new Error();
        console.log(`Azure ${role}: live chat response received`);
      } catch {
        report_failure(
          `Azure ${role}`,
          'live probe failed. Check endpoint, key, deployment, quota, TLS/network access and chat API compatibility.',
        );
      }
    } else console.log(`Azure ${role}: configuration present; not live-validated (use --probe-models).`);
  }
}
console.log(
  'Image generation and web search are optional; validate them through their app actions after configuring endpoints/keys.',
);
if (failures) process.exitCode = 1;
else console.log('Connection checks passed for the checks selected above.');
