// UI boundary: workspace_service; the research coordinator reads this brief through its API.
import { useEffect, useState } from 'react';
import { request_json } from '../services/http_client';
const fields = {
  company: 'Company & product',
  problem: 'Problem statement',
  current_system: 'Current systems, operations & costs',
  desired_outcome: 'Desired improvement',
  constraints: 'Budget, physical & infrastructure constraints',
  competitors: 'Competitors & comparable markets',
  employee_impact: 'Workload, stress & human impact',
  success_metrics: 'Measurable success criteria',
};
export function BriefPage({ project_id }: { project_id: string }) {
  const [brief, set_brief] = useState<Record<string, string>>({});
  const [message, set_message] = useState('');
  const [error, set_error] = useState('');
  useEffect(() => {
    void request_json<{ brief: Record<string, string> | null }>(`/api/workspace/projects/${project_id}`)
      .then((project) => set_brief(project.brief ?? {}))
      .catch((error) => set_error(error.message));
  }, [project_id]);
  async function submit_brief(event: React.FormEvent) {
    event.preventDefault();
    set_message('');
    set_error('');
    try {
      await request_json(`/api/workspace/projects/${project_id}/brief`, {
        method: 'PUT',
        body: JSON.stringify(Object.fromEntries(Object.keys(fields).map((key) => [key, brief[key] ?? '']))),
      });
      set_message('Company brief saved. The research team will use it in future investigations.');
    } catch (error) {
      set_error((error as Error).message);
    }
  }
  return (
    <section className="panel">
      <span className="eyebrow">THE BUSINESS CONTEXT</span>
      <h2>Company research brief</h2>
      <p className="intro">
        Describe where the company is now and what success would mean. Written estimates are welcome; identify
        them as estimates so the team can keep assumptions visible.
      </p>
      <form onSubmit={submit_brief}>
        <div className="brief_grid">
          {Object.entries(fields).map(([name, label]) => (
            <label key={name}>
              {label}
              <textarea
                className="visual_input"
                value={brief[name] ?? ''}
                maxLength={
                  name === 'company' ? 1000 : ['problem', 'current_system'].includes(name) ? 6000 : 3000
                }
                onChange={(event) => set_brief({ ...brief, [name]: event.target.value })}
              />
            </label>
          ))}
        </div>
        <button>Save company brief</button>
      </form>
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
