// UI boundary: analytics_service. Subjective scores are kept separate from evidence.
import { useEffect, useState } from 'react';
import { request_json, submit_json } from '../services/http_client';
type Decision = {
  id: string;
  label: string;
  result: {
    ranking: { name: string; weighted_score: number; scores: number[] }[];
    criteria: { name: string; weight: number }[];
  };
};
export function DecisionMatrix({ project_id }: { project_id: string }) {
  const [criteria, set_criteria] = useState([
    { name: 'Commercial value', weight: 30 },
    { name: 'Physical feasibility', weight: 30 },
    { name: 'Employee workload', weight: 20 },
    { name: 'Implementation simplicity', weight: 20 },
  ]);
  const [options, set_options] = useState([
    { name: 'Current approach', scores: [5, 5, 5, 5] },
    { name: 'Proposed approach', scores: [5, 5, 5, 5] },
  ]);
  const [decisions, set_decisions] = useState<Decision[]>([]);
  const [error, set_error] = useState('');
  const [label, set_label] = useState('Options assessment');
  useEffect(() => {
    void request_json<Decision[]>(`/api/analytics/projects/${project_id}/decisions`)
      .then(set_decisions)
      .catch((error) => set_error(error.message));
  }, [project_id]);
  async function submit_decision(event: React.FormEvent) {
    event.preventDefault();
    set_error('');
    try {
      await submit_json(`/api/analytics/projects/${project_id}/decisions`, { label, criteria, options });
      set_decisions(await request_json(`/api/analytics/projects/${project_id}/decisions`));
    } catch (error) {
      set_error((error as Error).message);
    }
  }
  return (
    <section className="panel experiment">
      <span className="eyebrow">MAKE TRADE-OFFS EXPLICIT</span>
      <h2>Weighted decision matrix</h2>
      <p className="hint">
        Score each option from 0–10, with higher always better. Weights express your priorities. Starting
        scores are neutral examples; replace them with justified judgments.
      </p>
      <form onSubmit={submit_decision}>
        <label>
          Assessment name
          <input value={label} onChange={(event) => set_label(event.target.value)} required maxLength={120} />
        </label>
        <div className="scenario_form">
          {criteria.map((criterion, index) => (
            <label key={index}>
              <input
                aria-label={`Criterion ${index + 1} name`}
                value={criterion.name}
                maxLength={80}
                required
                onChange={(event) =>
                  set_criteria(
                    criteria.map((item, position) =>
                      position === index ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              Weight
              <input
                aria-label={`${criterion.name} weight`}
                type="number"
                min="0"
                max="100"
                value={criterion.weight}
                required
                onChange={(event) =>
                  set_criteria(
                    criteria.map((item, position) =>
                      position === index ? { ...item, weight: Number(event.target.value) } : item,
                    ),
                  )
                }
              />
            </label>
          ))}
        </div>
        <div className="table_wrapper">
          <table>
            <thead>
              <tr>
                <th>Option</th>
                {criteria.map((criterion, index) => (
                  <th key={index}>{criterion.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {options.map((option, index) => (
                <tr key={index}>
                  <td>
                    <input
                      aria-label={`Option ${index + 1} name`}
                      value={option.name}
                      maxLength={120}
                      required
                      onChange={(event) =>
                        set_options(
                          options.map((item, position) =>
                            position === index ? { ...item, name: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  {option.scores.map((score, score_index) => (
                    <td key={score_index}>
                      <input
                        aria-label={`${option.name}: ${criteria[score_index].name}`}
                        type="number"
                        min="0"
                        max="10"
                        step=".1"
                        value={score}
                        required
                        onChange={(event) =>
                          set_options(
                            options.map((item, position) =>
                              position === index
                                ? {
                                    ...item,
                                    scores: item.scores.map((value, column) =>
                                      column === score_index ? Number(event.target.value) : value,
                                    ),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dialog_actions">
          <button
            type="button"
            className="secondary"
            disabled={options.length >= 8}
            onClick={() =>
              set_options([
                ...options,
                { name: `Option ${options.length + 1}`, scores: criteria.map(() => 5) },
              ])
            }
          >
            Add option
          </button>
          <button>Calculate & save matrix</button>
        </div>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {decisions.map((decision) => (
        <section className="source_result" key={decision.id}>
          <h3>{decision.label}</h3>
          <ol>
            {decision.result.ranking.map((option) => (
              <li key={option.name}>
                {option.name}: <strong>{option.weighted_score.toFixed(2)} / 10</strong>
              </li>
            ))}
          </ol>
          <p className="hint">Weighted user judgments, not independently verified company performance.</p>
        </section>
      ))}
    </section>
  );
}
