// UI boundary: visual_service only.
import { useEffect, useState } from 'react';
import {
  list_assets,
  read_visual_status,
  create_diagram,
  create_image,
  read_asset_url,
  type VisualAsset,
} from '../services/visual_service';

export function VisualsPage({ project_id }: { project_id: string }) {
  const [assets, set_assets] = useState<VisualAsset[]>([]);
  const [images_configured, set_images_configured] = useState(false);
  const [error, set_error] = useState('');
  const [busy, set_busy] = useState(false);
  useEffect(() => {
    void Promise.all([list_assets(project_id), read_visual_status()])
      .then(([assets, status]) => {
        set_assets(assets);
        set_images_configured(status.images_configured);
      })
      .catch((error) => set_error(error.message));
  }, [project_id]);
  const pending = assets.some((asset) => ['queued', 'running'].includes(asset.state));
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      void list_assets(project_id)
        .then(set_assets)
        .catch((error) => set_error(error.message));
    }, 2000);
    return () => clearInterval(timer);
  }, [pending, project_id]);
  async function submit_visual(event: React.FormEvent<HTMLFormElement>, image: boolean) {
    event.preventDefault();
    set_error('');
    set_busy(true);
    const input = new FormData(event.currentTarget);
    try {
      if (image) await create_image(project_id, String(input.get('prompt')));
      else
        await create_diagram(
          project_id,
          String(input.get('title')),
          String(input.get('nodes'))
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        );
      set_assets(await list_assets(project_id));
    } catch (error) {
      set_error((error as Error).message);
    } finally {
      set_busy(false);
    }
  }
  return (
    <section>
      <div className="panel">
        <span className="eyebrow">SHOW THE THINKING</span>
        <h2>Implementation diagrams</h2>
        <p className="intro">
          Turn a proposed sequence into a clean, downloadable diagram. Diagrams describe a plan; they do not
          validate it.
        </p>
        <form onSubmit={(event) => submit_visual(event, false)}>
          <label>
            Diagram title
            <input name="title" required maxLength={100} placeholder="Implementation roadmap" />
          </label>
          <label>
            Steps, one per line (2–8)
            <textarea
              className="visual_input"
              name="nodes"
              required
              placeholder={
                'Measure the baseline\nRun a controlled pilot\nEvaluate commercial and technical outcomes\nPlan implementation'
              }
            />
          </label>
          <button disabled={busy}>Create diagram ↗</button>
        </form>
        <hr />
        <h2>Concept images</h2>
        <p className="hint">
          {images_configured
            ? 'Each request makes one paid Azure image-generation call. Illustrations are conceptual, not engineering evidence.'
            : 'Connect an Azure image deployment to enable concept artwork. No image API calls are made in simulation.'}
        </p>
        <form onSubmit={(event) => submit_visual(event, true)}>
          <label>
            Describe the illustration
            <input
              name="prompt"
              required
              maxLength={4000}
              disabled={!images_configured}
              placeholder="A technical concept illustration for the proposal…"
            />
          </label>
          <button style={{ marginTop: 15 }} disabled={busy || !images_configured}>
            Generate one concept image ↗
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="visual_grid">
        {assets.map((asset) => (
          <div className="panel" key={asset.id}>
            <h2>{asset.title}</h2>
            {asset.state === 'completed' ? (
              <>
                <img className="visual_asset" src={read_asset_url(asset.id)} alt={asset.title} />
                <a href={read_asset_url(asset.id)} download>
                  Download {asset.kind} ↗
                </a>
              </>
            ) : (
              <p className={asset.state === 'failed' ? 'error' : 'hint'}>{asset.error ?? asset.state}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
