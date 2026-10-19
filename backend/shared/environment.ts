import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Injected settings win; explicit .env settings override generated local defaults.
export function load_environment(directory = '.', environment: NodeJS.ProcessEnv = process.env) {
  const settings: Record<string, string> = Object.assign(
    {},
    ...['.env.local', '.env'].map((filename) => {
      const path = `${directory}/${filename}`;
      return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
    }),
  );
  for (const [name, value] of Object.entries(settings)) environment[name] ??= value;
}
