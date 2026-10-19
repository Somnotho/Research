import '../backend/shared/configuration.ts';
import EmbeddedPostgres from 'embedded-postgres';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { read_configuration } from '../backend/shared/configuration.ts';

// Development helper for the initial empty database only. Never resets a database.
const postgres = new EmbeddedPostgres({
  databaseDir: resolve('data/postgres'),
  user: 'research',
  password: read_configuration('LOCAL_DATABASE_PASSWORD'),
  port: 55432,
  persistent: true,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: (message) => console.error(message),
});
try {
  mkdirSync('data/postgres', { recursive: true });
  if (!existsSync('data/postgres/PG_VERSION')) await postgres.initialise();
  await postgres.start();
  const client = postgres.getPgClient();
  await client.connect();
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = 'research'");
  await client.end();
  if (!result.rowCount) await postgres.createDatabase('research');
  for (const service of [
    'workspace',
    'knowledge',
    'research',
    'analytics',
    'report',
    'visual',
    'scientific',
    'evidence',
    'execution',
  ]) {
    const directory = `backend/services/${service}_service/prisma/migrations`;
    const migration = `${directory}/202610190001_initial/migration.sql`;
    if (existsSync(migration)) continue;
    mkdirSync(`${directory}/202610190001_initial`, { recursive: true });
    const result = spawnSync(
      'node_modules/.bin/prisma',
      [
        'migrate',
        'diff',
        '--from-empty',
        '--to-schema-datamodel',
        `backend/services/${service}_service/prisma/schema.prisma`,
        '--script',
        '--config',
        `backend/services/${service}_service/prisma.config.ts`,
      ],
      { env: process.env, encoding: 'utf8' },
    );
    if (result.status) throw new Error(result.stderr);
    writeFileSync(migration, result.stdout);
    writeFileSync(`${directory}/migration_lock.toml`, 'provider = "postgresql"\n');
    console.log(`${service}: generated initial migration`);
  }
} finally {
  await postgres.stop();
}
