// UI boundary: research_service (conversation, runs) and report_service (exports).
import { useEffect, useRef, useState } from 'react';
import {
  list_messages,
  list_runs,
  read_run,
  start_research,
  cancel_research,
  type Message,
  type ResearchRun,
} from '../services/research_service';
import { list_reports, read_report_url, type ResearchReport } from '../services/report_service';
import { MarkdownView } from '../components/markdown_view';

function render_step_detail(detail: string) {
  try {
    const analysis = JSON.parse(detail);
    if (typeof analysis.text === 'string')
      return (
        <>
          <MarkdownView content={analysis.text} />
          <p className="hint">
            Model: {analysis.model}
            {analysis.usage
              ? ` · ${analysis.usage.prompt_tokens} input tokens · ${analysis.usage.completion_tokens} output tokens`
              : ' · No billed token usage recorded'}
          </p>
        </>
      );
  } catch {
    /* Task descriptions are plain text rather than model results. */
  }
  return <p className="hint">{detail}</p>;
}

export function ResearchPage({ project_id, simulation }: { project_id: string; simulation: boolean }) {
  const [messages, set_messages] = useState<Message[]>([]);
  const [reports, set_reports] = useState<ResearchReport[]>([]);
  const [run, set_run] = useState<ResearchRun | null>(null);
  const [question, set_question] = useState('');
  const [web_enabled, set_web_enabled] = useState(false);
  const [error, set_error] = useState('');
  const [submitting, set_submitting] = useState(false);
  const [limits, set_limits] = useState({
    max_tool_calls: 3,
    max_duration_seconds: 600,
    max_output_tokens: 2000,
    allow_code_execution: false,
  });
  const end_reference = useRef<HTMLDivElement>(null);
  const busy = submitting || Boolean(run && ['queued', 'running'].includes(run.state));

  async function load_conversation() {
    const [messages, reports] = await Promise.all([list_messages(project_id), list_reports(project_id)]);
    set_messages(messages);
    set_reports(reports);
  }
  useEffect(() => {
    let cancelled = false;
    void Promise.all([list_messages(project_id), list_reports(project_id), list_runs(project_id)])
      .then(async ([messages, reports, runs]) => {
        const run = runs.length ? await read_run(runs[0].id) : null;
        if (!cancelled) {
          set_messages(messages);
          set_reports(reports);
          set_run(run);
        }
      })
      .catch((error) => {
        if (!cancelled) set_error(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [project_id]);
  useEffect(() => {
    if (!run || !['queued', 'running'].includes(run.state)) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void read_run(run.id)
        .then(async (result) => {
          if (cancelled) return;
          set_run(result);
          if (['completed', 'failed', 'cancelled'].includes(result.state)) await load_conversation();
        })
        .catch((error) => {
          if (!cancelled) set_error(error.message);
        });
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [run?.id, run?.state, project_id]);
  useEffect(() => {
    end_reference.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  async function submit_question(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    set_submitting(true);
    set_error('');
    try {
      const run = await start_research(project_id, question, web_enabled, limits);
      set_run(run);
      set_question('');
      await load_conversation();
    } catch (error) {
      set_error((error as Error).message);
    } finally {
      set_submitting(false);
    }
  }
  return (
    <div className="research_grid">
      <section>
        <div className="section_heading">
          <h2>Research conversation</h2>
          <span className="muted">Saved privately</span>
        </div>
        <div className="conversation">
          {!messages.length && (
            <div className="empty">
              <span className="empty_symbol">✳</span>
              <h3>What could work better?</h3>
              <p>
                Describe the company, the challenge, and the idea you want to investigate.
                <br />
                Your team will explore the evidence and challenge the assumptions.
              </p>
            </div>
          )}
          {messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <small>{message.role === 'user' ? 'YOU' : 'RESEARCH DIRECTOR'}</small>
              <MarkdownView content={message.content} />
            </article>
          ))}
          <div ref={end_reference} />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {run?.state === 'failed' && (
          <p className="error" role="alert">
            Investigation stopped: {run.error}. Partial activity is retained below.
          </p>
        )}
        <details className="run_controls">
          <summary>Investigation limits & controls</summary>
          <div className="scenario_form">
            <label>
              Maximum tool calls
              <input
                type="number"
                min="0"
                max="4"
                value={limits.max_tool_calls}
                onChange={(event) => set_limits({ ...limits, max_tool_calls: Number(event.target.value) })}
              />
            </label>
            <label>
              Time limit (seconds)
              <input
                type="number"
                min="60"
                max="1200"
                value={limits.max_duration_seconds}
                onChange={(event) =>
                  set_limits({ ...limits, max_duration_seconds: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Output tokens per model call
              <input
                type="number"
                min="500"
                max="4000"
                value={limits.max_output_tokens}
                onChange={(event) => set_limits({ ...limits, max_output_tokens: Number(event.target.value) })}
              />
            </label>
          </div>
          <label>
            <input
              type="checkbox"
              checked={limits.allow_code_execution}
              onChange={(event) => set_limits({ ...limits, allow_code_execution: event.target.checked })}
            />{' '}
            Allow disposable implementation tests for this investigation
          </label>
          <p className="hint">
            At most six model calls. No automatic retries. Cancel stops further work; provider calls already
            accepted may still be billed.
          </p>
        </details>
        {busy && run && (
          <button
            className="secondary"
            onClick={() =>
              void cancel_research(run.id)
                .then(set_run)
                .catch((error) => set_error(error.message))
            }
          >
            Cancel investigation
          </button>
        )}
        {run?.state === 'cancelled' && (
          <p className="hint">Investigation cancelled. Partial findings are retained.</p>
        )}
        {run?.plan && (
          <section className="panel experiment">
            <h2>Research plan</h2>
            <p>{run.plan.objective}</p>
            <ol>
              {run.plan.tasks.map((task, index) => (
                <li key={index}>
                  <strong>{task.owner}</strong>: {task.task}
                </li>
              ))}
            </ol>
            {run.plan.missing_inputs.length > 0 && (
              <details>
                <summary>Missing inputs identified</summary>
                <ul>
                  {run.plan.missing_inputs.map((input, index) => (
                    <li key={index}>{input}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}
        <form className="composer" onSubmit={submit_question}>
          <textarea
            aria-label="Research question"
            value={question}
            onChange={(event) => set_question(event.target.value)}
            maxLength={16000}
            required
            placeholder="What are we trying to improve? Bring the problem, your idea, and what you already know…"
          />
          <div className="composer_actions">
            <label>
              <input
                type="checkbox"
                checked={web_enabled}
                onChange={(event) => set_web_enabled(event.target.checked)}
              />{' '}
              Search external sources
            </label>
            <button disabled={busy}>{busy ? 'Team is investigating…' : 'Explore with the team ↗'}</button>
          </div>
        </form>
        <p className="hint">
          {simulation
            ? 'Simulation uses fixed test responses; no AI reasoning or web search occurs.'
            : 'Up to six model calls per investigation. External search sends your question to the configured search provider.'}{' '}
          Scientific tool results are executed and recorded; proposed physical experiments and company changes
          are not performed.
        </p>
        {run && (
          <section className="panel activity">
            <div className="section_heading">
              <h2>Team activity</h2>
              <span className={`badge ${run.state}`}>{run.state}</span>
            </div>
            <ol>
              {run.steps?.map((step) => (
                <li key={step.id}>
                  <span className={`dot ${step.state}`} />
                  <div>
                    <strong>{step.agent.replaceAll('_', ' ')}</strong>
                    <span className="muted"> · {step.state}</span>
                    <details>
                      <summary>
                        {step.state === 'completed' ? 'View findings and model usage' : 'View task'}
                      </summary>
                      {render_step_detail(step.detail)}
                    </details>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </section>
      <aside className="report_panel panel">
        <span className="eyebrow">DELIVERABLES</span>
        <h2>Research reports</h2>
        <p className="hint">
          Baseline/proposal comparisons, director synthesis, specialist notes, independent review and source
          provenance.
        </p>
        {!reports.length && <p className="muted">Your first report will appear here.</p>}
        {reports.map((report) => (
          <div className="report" key={report.id}>
            <strong>{report.title}</strong>
            <small>{new Date(report.created_at).toLocaleDateString()}</small>
            <div>
              <a href={read_report_url(report.id, 'pdf')}>PDF ↗</a>
              <a href={read_report_url(report.id, 'pptx')}>Slides ↗</a>
              <a href={read_report_url(report.id, 'docx')}>Word ↗</a>
              <a href={read_report_url(report.id, 'md')}>Markdown ↗</a>
            </div>
          </div>
        ))}
        <hr />
        <p className="hint">
          Decisions need human review. Search snippets and selected excerpts do not establish exhaustive
          research.
        </p>
      </aside>
    </div>
  );
}
