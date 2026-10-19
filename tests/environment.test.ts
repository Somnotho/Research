import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load_environment } from '../backend/shared/environment.ts';

test('.env overrides generated defaults, preserves injected settings and parses quoted values/comments', () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-env-'));
  try {
    writeFileSync(join(directory, '.env.local'), 'MODEL=local\nPASSWORD=generated\nOPTION=default\n');
    writeFileSync(
      join(directory, '.env'),
      'MODEL="azure" # comment\nPASSWORD="chosen#password"\nOPTION=\nINJECTED=file\n',
    );
    const environment: NodeJS.ProcessEnv = { INJECTED: 'platform' };
    load_environment(directory, environment);
    assert.deepEqual(environment, {
      MODEL: 'azure',
      PASSWORD: 'chosen#password',
      OPTION: '',
      INJECTED: 'platform',
    });
  } finally {
    rmSync(directory, { recursive: true });
  }
});
