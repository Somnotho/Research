import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { experiment_input, type ExperimentInput } from './contracts.ts';

export async function execute_experiment(
  input: ExperimentInput,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const validated = experiment_input.parse(input);
  const python = process.env.SCIENCE_PYTHON ?? resolve('data/science_venv/bin/python');
  return new Promise((fulfill, reject) => {
    const child = spawn(python, ['-I', resolve('backend/services/scientific_service/compute.py')], {
      shell: false,
      env: { PATH: '/usr/bin:/bin', OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
      signal,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Scientific operation exceeded 20 second limit'));
    }, 20000);
    child.stdout.on('data', (contents) => {
      output += contents.toString();
      if (output.length > 1000000) child.kill('SIGKILL');
    });
    child.stderr.resume();
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(output);
        if (code || result.error)
          reject(Object.assign(new Error(result.error ?? 'Scientific process failed'), { statusCode: 422 }));
        else fulfill(result);
      } catch {
        reject(
          Object.assign(new Error('Scientific process terminated or returned invalid output'), {
            statusCode: 422,
          }),
        );
      }
    });
    child.stdin.end(JSON.stringify(validated));
  });
}
