import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execution_input } from './contracts.ts';
import { z } from 'zod';
const containers = new Set<string>();
export async function stop_executions() {
  await Promise.all(
    [...containers].map(
      (name) =>
        new Promise<void>((fulfill) => {
          const child = spawn('docker', ['rm', '-f', name], { stdio: 'ignore' });
          child.once('close', () => fulfill());
          child.once('error', () => fulfill());
        }),
    ),
  );
}

const harness = `import contextlib,io,json,sys,types,unittest,resource
resource.setrlimit(resource.RLIMIT_CPU,(15,15))
resource.setrlimit(resource.RLIMIT_FSIZE,(1048576,1048576))
request=json.loads(sys.stdin.read(100000))
class LimitedLog(io.StringIO):
 def write(self,value):
  if self.tell()+len(value)>100000: raise RuntimeError('Output limit exceeded')
  return super().write(value)
logs=LimitedLog()
try:
 with contextlib.redirect_stdout(logs),contextlib.redirect_stderr(logs):
  module=types.ModuleType('research_submission')
  exec(compile(request['source'],'submission.py','exec'),module.__dict__)
  exec(compile(request['tests'],'test_submission.py','exec'),module.__dict__)
  suite=unittest.defaultTestLoader.loadTestsFromModule(module)
  result=unittest.TextTestRunner(stream=logs,verbosity=2).run(suite)
 print(json.dumps({'passed':result.wasSuccessful() and result.testsRun>0,'tests_run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'log':logs.getvalue()}))
except BaseException as error:
 print(json.dumps({'passed':False,'tests_run':0,'error':str(error)[:1000],'log':logs.getvalue()}))
`;
export async function execute_python(input: z.infer<typeof execution_input>) {
  const request = execution_input.parse(input);
  const image =
    process.env.EXECUTION_IMAGE ??
    readFileSync('backend/services/execution_service/runtime_image.txt', 'utf8').trim();
  if (!image.includes('@sha256:'))
    throw new Error('Execution image must be pinned by an immutable registry digest');
  const name = 'research_sandbox_' + randomUUID().replaceAll('-', '');
  containers.add(name);
  return new Promise<Record<string, unknown>>((fulfill, reject) => {
    const child = spawn(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        '--name',
        name,
        '--network',
        'none',
        '--cpus',
        '1',
        '--memory',
        '256m',
        '--memory-swap',
        '256m',
        '--pids-limit',
        '64',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--user',
        '65534:65534',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=32m',
        '--workdir',
        '/tmp',
        image,
        'python',
        '-I',
        '-c',
        harness,
      ],
      { shell: false, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    let stopped = false;
    function stop_container(reason: string) {
      if (stopped) return;
      stopped = true;
      const removal = spawn('docker', ['rm', '-f', name], { stdio: 'ignore' });
      removal.on('error', () => {});
      child.kill('SIGKILL');
      fulfill({ passed: false, tests_run: 0, error: reason });
    }
    const timer = setTimeout(
      () => stop_container('Sandbox time limit exceeded'),
      (request.timeout_seconds + 3) * 1000,
    );
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 200000) stop_container('Sandbox output limit exceeded');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 200000) stop_container('Sandbox output limit exceeded');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      containers.delete(name);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      containers.delete(name);
      if (stopped) return;
      try {
        const result = JSON.parse(stdout);
        fulfill({
          ...result,
          container_exit_code: code,
          runtime_image: image,
          isolation:
            'No network, no host mounts, read-only root, unprivileged user, dropped capabilities, 256 MB memory, one CPU and 64 processes',
        });
      } catch {
        fulfill({
          passed: false,
          tests_run: 0,
          error: 'Container failed or did not produce a valid test receipt',
          container_exit_code: code,
          log: stderr.slice(0, 2000),
        });
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));
  });
}
