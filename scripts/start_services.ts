import '../backend/shared/configuration.ts';
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { read_configuration } from '../backend/shared/configuration.ts';
import { apply_migrations } from './apply_migrations.ts';

const children: ChildProcess[] = [];
let postgres: EmbeddedPostgres | undefined;
let stopping = false;
async function stop_services() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) resolve();
          else child.once('exit', () => resolve());
        }),
    ),
  );
  if (postgres) await postgres.stop();
}
process.on('SIGINT', () => void stop_services().then(() => process.exit(0)));
process.on('SIGTERM', () => void stop_services().then(() => process.exit(0)));

try {
  if (process.env.USE_EXTERNAL_DATABASE !== 'true') {
    mkdirSync('data/postgres', { recursive: true });
    postgres = new EmbeddedPostgres({
      databaseDir: resolve('data/postgres'),
      user: 'research',
      password: read_configuration('LOCAL_DATABASE_PASSWORD'),
      port: 55432,
      persistent: true,
      postgresFlags: ['-h', '127.0.0.1'],
      onLog: () => {},
      onError: () => {},
    });
    if (!existsSync('data/postgres/PG_VERSION')) await postgres.initialise();
    await postgres.start();
    const client = postgres.getPgClient();
    await client.connect();
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = 'research'");
    await client.end();
    if (!result.rowCount) await postgres.createDatabase('research');
    console.log('Local PostgreSQL started on loopback port 55432.');
  }
  const services = [
    'workspace',
    'knowledge',
    'analytics',
    'report',
    'visual',
    'scientific',
    'evidence',
    'execution',
    'research',
    'gateway',
  ];
  for (const service of services.filter((service) => service !== 'gateway')) {
    await apply_migrations(service);
  }
  const agents = ['planner', 'science', 'commercial', 'analytics', 'reviewer', 'director'];
  const processes = [
    ...agents.map((role) => ({
      name: `${role}_agent`,
      entry: 'backend/services/agent_service/server.ts',
      environment: { ...process.env, AGENT_ROLE: role },
    })),
    ...services.map((service) => ({
      name: service,
      entry: `backend/services/${service}_service/server.ts`,
      environment: process.env,
    })),
  ];
  for (const process_specification of processes) {
    const child = spawn('node_modules/.bin/tsx', [process_specification.entry], {
      stdio: 'inherit',
      env: process_specification.environment,
    });
    children.push(child);
    child.once('exit', (code) => {
      if (!stopping) {
        console.error(`${process_specification.name} stopped (${code}); shutting down dependent processes.`);
        void stop_services().then(() => process.exit(code || 1));
      }
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Startup failed');
  await stop_services();
  process.exit(1);
}
