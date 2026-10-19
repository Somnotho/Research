import '../../shared/configuration.ts';
import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { read_database_url } from '../../shared/configuration.ts';

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: { path: './prisma/migrations' },
  experimental: { adapter: true },
  engine: 'js',
  adapter: async () =>
    new PrismaPg({ connectionString: read_database_url('evidence') }, { schema: 'evidence' }),
});
