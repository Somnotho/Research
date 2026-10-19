import '../backend/shared/configuration.ts';
import { Client } from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { read_database_url } from '../backend/shared/configuration.ts';

// Apply Prisma-generated SQL with transactional, checksum-checked per-service history.
// This avoids reliance on a downloaded native Prisma migration engine.
export async function apply_migrations(service: string) {
  if (
    ![
      'workspace',
      'knowledge',
      'research',
      'analytics',
      'report',
      'visual',
      'scientific',
      'evidence',
      'execution',
    ].includes(service)
  )
    throw new Error('Unknown service');
  const database = new Client({ connectionString: read_database_url(service) });
  await database.connect();
  try {
    await database.query('BEGIN');
    await database.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `research_office_migration_${service}`,
    ]);
    await database.query(`CREATE SCHEMA IF NOT EXISTS "${service}"`);
    await database.query(`SET LOCAL search_path TO "${service}"`);
    await database.query(
      'CREATE TABLE IF NOT EXISTS service_migration (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const directory = `backend/services/${service}_service/prisma/migrations`;
    for (const version of readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      const sql = readFileSync(`${directory}/${version}/migration.sql`, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await database.query('SELECT checksum FROM service_migration WHERE version=$1', [
        version,
      ]);
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum)
          throw new Error(`Previously applied ${service} migration was changed: ${version}`);
        continue;
      }
      await database.query(sql);
      await database.query('INSERT INTO service_migration(version,checksum) VALUES($1,$2)', [
        version,
        checksum,
      ]);
      console.log(`${service}: applied ${version}`);
    }
    await database.query('COMMIT');
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  } finally {
    await database.end();
  }
}
