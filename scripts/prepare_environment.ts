import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const services = [
  'workspace',
  'knowledge',
  'research',
  'analytics',
  'report',
  'visual',
  'scientific',
  'evidence',
  'execution',
];
mkdirSync('data', { recursive: true });
if (!existsSync('.env.local')) {
  const password = randomBytes(24).toString('hex');
  const lines = [
    `OWNER_PASSWORD=${randomBytes(24).toString('base64url')}`,
    `SESSION_SECRET=${randomBytes(48).toString('base64url')}`,
    `INTERNAL_SERVICE_TOKEN=${randomBytes(48).toString('base64url')}`,
    `LOCAL_DATABASE_PASSWORD=${password}`,
    'PUBLIC_ORIGIN=http://127.0.0.1:3000',
    'RESEARCH_MODEL_MODE=simulation',
    ...services.map(
      (service) =>
        `${service.toUpperCase()}_DATABASE_URL=postgresql://research:${password}@127.0.0.1:55432/research?schema=${service}`,
    ),
  ];
  writeFileSync('.env.local', lines.join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  console.log('Generated private local configuration in .env.local. No credentials were printed.');
}
await import('../backend/shared/configuration.ts');
// Add configuration for newly introduced local services without replacing user values.
if (process.env.USE_EXTERNAL_DATABASE !== 'true') {
  const configuration = readFileSync('.env.local', 'utf8');
  const additions = services
    .filter((service) => !process.env[`${service.toUpperCase()}_DATABASE_URL`])
    .map(
      (service) =>
        `${service.toUpperCase()}_DATABASE_URL=postgresql://research:${process.env.LOCAL_DATABASE_PASSWORD}@127.0.0.1:55432/research?schema=${service}`,
    );
  if (additions.length) {
    writeFileSync('.env.local', configuration + additions.join('\n') + '\n', { mode: 0o600 });
    for (const line of additions) {
      const index = line.indexOf('=');
      process.env[line.slice(0, index)] = line.slice(index + 1);
    }
  }
}
for (const service of services) {
  const config = `backend/services/${service}_service/prisma.config.ts`;
  const result = spawnSync('node_modules/.bin/prisma', ['generate', '--config', config], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status) process.exit(result.status ?? 1);
}
console.log('Prisma clients generated. Start services with npm run dev.');
if (!existsSync('data/science_venv/bin/python')) {
  const result = spawnSync('python3', ['-m', 'venv', 'data/science_venv'], { stdio: 'inherit' });
  if (result.status) throw new Error('Python 3.12+ with venv support is required');
}
const science = spawnSync(
  'data/science_venv/bin/python',
  [
    '-m',
    'pip',
    'install',
    '--disable-pip-version-check',
    '--no-input',
    '--cache-dir',
    'data/pip_cache',
    '-r',
    'backend/services/scientific_service/requirements.txt',
  ],
  { stdio: 'inherit', env: process.env },
);
if (science.status)
  throw new Error('Scientific dependencies could not be installed with normal verification');
for (const binary of ['tesseract', 'pdftoppm']) {
  if (spawnSync(binary, ['--version'], { stdio: 'ignore' }).error)
    throw new Error(`${binary} is required for OCR. Install it before using scanned documents.`);
}
const runtime_image = readFileSync('backend/services/execution_service/runtime_image.txt', 'utf8').trim();
const image_status = spawnSync('docker', ['image', 'inspect', runtime_image], { stdio: 'ignore' });
if (image_status.status !== 0) {
  const image_pull = spawnSync('docker', ['pull', runtime_image], { stdio: 'inherit' });
  if (image_pull.status !== 0)
    throw new Error('Docker and the pinned execution image are required for isolated implementation tests');
}
