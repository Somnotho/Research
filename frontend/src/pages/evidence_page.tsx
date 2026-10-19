// UI boundary: evidence_service; imported full text is ingested through knowledge_service by the backend.
import { useEffect, useState } from 'react';
import { request_json, submit_json } from '../services/http_client';
type Source = {
  id: string;
  title: string;
  url: string;
  content_hash: string;
  fetched_at: string;
  document_id: string;
};
type SearchResult = { sources: { title: string; url: string; excerpt?: string }[]; method: string };
export function EvidencePage({ project_id }: { project_id: string }) {
  const [sources, set_sources] = useState<Source[]>([]);
  const [results, set_results] = useState<SearchResult | null>(null);
  const [error, set_error] = useState('');
  const [busy, set_busy] = useState(false);
  useEffect(() => {
    void request_json<Source[]>(`/api/evidence/projects/${project_id}/sources`)
      .then(set_sources)
      .catch((error) => set_error(error.message));
  }, [project_id]);
  async function import_source(url: string) {
    set_busy(true);
    set_error('');
    try {
      await submit_json(`/api/evidence/projects/${project_id}/sources`, { url });
      set_sources(await request_json(`/api/evidence/projects/${project_id}/sources`));
    } catch (error) {
      set_error((error as Error).message);
    } finally {
      set_busy(false);
    }
  }
  async function submit_search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    set_busy(true);
    set_error('');
    const values = new FormData(event.currentTarget);
    try {
      set_results(await submit_json('/api/evidence/search', { question: values.get('question') }));
    } catch (error) {
      set_error((error as Error).message);
    } finally {
      set_busy(false);
    }
  }
  return (
    <section>
      <div className="panel">
        <span className="eyebrow">TRACE THE EVIDENCE</span>
        <h2>Sources & internet research</h2>
        <p className="intro">
          Discover references, import accessible full text, and preserve a timestamp and content fingerprint.
          Imported pages and PDFs become searchable library documents. No paywalls or access controls are
          bypassed.
        </p>
        <form onSubmit={submit_search}>
          <label>
            Search question
            <input
              name="question"
              required
              maxLength={16000}
              placeholder="Technology, company, product or market question"
            />
          </label>
          <button disabled={busy} style={{ marginTop: 12 }}>
            Discover sources ↗
          </button>
        </form>
        <p className="hint">
          Search sends the query to the configured provider. Simulation makes no search requests. Live mode
          uses Brave when configured and limited Wikipedia discovery otherwise.
        </p>
        <hr />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void import_source(String(new FormData(event.currentTarget).get('url')));
          }}
        >
          <label>
            Import a public HTTPS page or PDF
            <input name="url" type="url" required placeholder="https://…" />
          </label>
          <button disabled={busy} style={{ marginTop: 12 }}>
            {busy ? 'Working…' : 'Download & add to evidence ↗'}
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {results && (
          <section>
            <h3>Discovery results</h3>
            <p className="hint">{results.method}</p>
            {results.sources.map((source) => (
              <div className="source_result" key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
                <p>{source.excerpt}</p>
                <button className="secondary" disabled={busy} onClick={() => void import_source(source.url)}>
                  Import accessible full text
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
      <section className="panel experiment">
        <h2>Saved evidence</h2>
        {!sources.length && <p className="muted">No sources imported yet.</p>}
        {sources.map((source) => (
          <div className="source_result" key={source.id}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
            <p className="hint">
              Retrieved {new Date(source.fetched_at).toLocaleString()}
              <br />
              SHA-256: {source.content_hash}
            </p>
            <a href={`/api/knowledge/documents/${source.document_id}/original`}>
              Download retained text/document ↗
            </a>
          </div>
        ))}
      </section>
    </section>
  );
}
