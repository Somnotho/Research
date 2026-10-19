// UI boundary: execution_service. Source and tests run in a disposable restricted container.
import { useEffect, useState } from 'react';
import { request_json, submit_json } from '../services/http_client';
type CodeTest = {
  id: string;
  state: string;
  input: { source: string; tests: string };
  result: Record<string, any> | null;
};
export function ImplementationPage({ project_id }: { project_id: string }) {
  const [source, set_source] = useState(
    'def calculate_net_benefit(savings, running_cost, months, upfront_cost):\n    return (savings - running_cost) * months - upfront_cost\n',
  );
  const [tests, set_tests] = useState(
    'import unittest\n\nclass ResearchTests(unittest.TestCase):\n    def test_break_even(self):\n        self.assertEqual(calculate_net_benefit(100, 0, 12, 1200), 0)\n\n    def test_negative_benefit(self):\n        self.assertLess(calculate_net_benefit(50, 100, 12, 0), 0)\n',
  );
  const [jobs, set_jobs] = useState<CodeTest[]>([]);
  const [error, set_error] = useState('');
  const [busy, set_busy] = useState(false);
  const pending = jobs.some((job) => ['queued', 'running'].includes(job.state));
  useEffect(() => {
    void request_json<CodeTest[]>(`/api/execution/projects/${project_id}/tests`)
      .then(set_jobs)
      .catch((error) => set_error(error.message));
  }, [project_id]);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      void request_json<CodeTest[]>(`/api/execution/projects/${project_id}/tests`)
        .then(set_jobs)
        .catch((error) => set_error(error.message));
    }, 1000);
    return () => clearInterval(timer);
  }, [pending, project_id]);
  async function submit_test(event: React.FormEvent) {
    event.preventDefault();
    set_busy(true);
    set_error('');
    try {
      await submit_json(`/api/execution/projects/${project_id}/tests`, {
        operation: 'python_test',
        source,
        tests,
        timeout_seconds: 10,
      });
      set_jobs(await request_json(`/api/execution/projects/${project_id}/tests`));
    } catch (error) {
      set_error((error as Error).message);
    } finally {
      set_busy(false);
    }
  }
  return (
    <section>
      <div className="panel">
        <span className="eyebrow">IMPLEMENT · TEST · KEEP THE RECEIPT</span>
        <h2>Implementation laboratory</h2>
        <p className="intro">
          Try a small algorithm or prototype and run actual unit tests. Results can inform the research team;
          passing tests establish only the behavior covered by those tests.
        </p>
        <form onSubmit={submit_test}>
          <div className="brief_grid">
            <label>
              Python implementation
              <textarea
                className="code_editor"
                required
                maxLength={20000}
                value={source}
                onChange={(event) => set_source(event.target.value)}
                spellCheck={false}
              />
            </label>
            <label>
              Python unittest tests
              <textarea
                className="code_editor"
                required
                maxLength={20000}
                value={tests}
                onChange={(event) => set_tests(event.target.value)}
                spellCheck={false}
              />
            </label>
          </div>
          <button disabled={busy}>{busy ? 'Queuing…' : 'Run implementation & tests ↗'}</button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="hint">
          Python standard library only. Disposable container: no network, no host mounts, read-only root,
          unprivileged user, bounded execution time, one CPU, 256 MB memory and 64 processes. No company
          infrastructure is modified. Zero-test runs fail validation.
        </p>
      </div>
      {jobs.map((job) => (
        <section className="panel experiment" key={job.id}>
          <div className="section_heading">
            <h2>Implementation test</h2>
            <span className={`badge ${job.state}`}>{job.state}</span>
          </div>
          {job.result && (
            <>
              <div className="metrics">
                <div>
                  <small>TESTS EXECUTED</small>
                  <strong>{job.result.tests_run ?? 0}</strong>
                </div>
                <div>
                  <small>FAILURES</small>
                  <strong>{job.result.failures ?? '—'}</strong>
                </div>
                <div>
                  <small>ERRORS</small>
                  <strong>{job.result.errors ?? '—'}</strong>
                </div>
                <div>
                  <small>RESULT</small>
                  <strong>{job.result.passed ? 'Passed' : 'Failed'}</strong>
                </div>
              </div>
              <pre className="receipt">
                {job.result.error ?? ''}
                {'\n'}
                {job.result.log ?? ''}
              </pre>
            </>
          )}
          <details>
            <summary>Source, tests and complete execution receipt</summary>
            <pre className="receipt">{JSON.stringify({ input: job.input, result: job.result }, null, 2)}</pre>
          </details>
        </section>
      ))}
    </section>
  );
}
