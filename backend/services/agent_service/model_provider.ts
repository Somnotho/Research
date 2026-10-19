import { z } from 'zod';

const model_response = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }) })).min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
});

export { read_model_status } from '../../shared/model_status.ts';

export async function request_analysis(
  role: string,
  instructions: string,
  context: string,
  options: { signal?: AbortSignal; max_output_tokens?: number } = {},
) {
  if (process.env.RESEARCH_MODEL_MODE === 'simulation') {
    if (role === 'planner')
      return {
        text: JSON.stringify({
          objective: 'Simulation of a bounded research plan',
          tasks: [
            { owner: 'science', task: 'Check technical assumptions' },
            { owner: 'commercial', task: 'Compare business options' },
            { owner: 'analytics', task: 'Interpret computed scenarios' },
            { owner: 'reviewer', task: 'Challenge unsupported claims' },
            { owner: 'director', task: 'Synthesize evidence' },
          ],
          tool_calls: [],
          missing_inputs: ['Configure a live Azure model for AI-generated planning'],
        }),
        usage: null,
        model: 'local_workflow_simulation',
      };
    return { text: create_simulation(role), usage: null, model: 'local_workflow_simulation' };
  }
  const endpoint = process.env.AZURE_AI_ENDPOINT;
  const key = process.env.RESEARCH_AZURE_KEY;
  const deployment = process.env[`AZURE_${role.toUpperCase()}_MODEL`] || process.env.AZURE_AI_MODEL;
  if (!endpoint || !key || !deployment)
    throw new Error(
      'Azure configuration missing. Set endpoint, deployment and key or explicitly enable simulation mode.',
    );
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Azure endpoint must be an HTTPS base URL without credentials, query or fragment.');
  let base = endpoint.replace(/\/$/, '');
  if (!base.endsWith('/openai/v1') && !base.endsWith('/models')) base += '/openai/v1';
  const api_url = new URL(base + '/chat/completions');
  if (base.endsWith('/models'))
    api_url.searchParams.set('api-version', process.env.AZURE_AI_API_VERSION ?? '2024-05-01-preview');
  const response = await fetch(api_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: deployment,
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: context },
      ],
      max_completion_tokens:
        options.max_output_tokens ??
        z.coerce
          .number()
          .int()
          .min(100)
          .max(16000)
          .parse(process.env.AZURE_MAX_COMPLETION_TOKENS || 4000),
    }),
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(180000)])
      : AbortSignal.timeout(180000),
  });
  if (!response.ok)
    throw new Error(
      `Azure ${role} request returned HTTP ${response.status}. Check model, endpoint, credentials, quota and chat-completions compatibility.`,
    );
  const result = model_response.parse(await response.json());
  return { text: result.choices[0].message.content, usage: result.usage ?? null, model: deployment };
}

function create_simulation(role: string) {
  const notes: Record<string, string> = {
    science:
      '## Technical feasibility checklist\nIdentify the physical mechanism, define variables and units, compare against the current system, and propose a controlled experiment. A concept from a book is a hypothesis until tested in this application.',
    commercial:
      '## Commercial checklist\nGather current operating costs, customer demand, competitor offerings and implementation costs. Compare a low-cost process improvement with a technology investment. Include employee training and workload.',
    analytics:
      '## Calculation checklist\nUse the saved financial scenarios as user-supplied assumptions. Net monthly benefit = monthly savings − monthly running cost. Payback = upfront cost ÷ positive net monthly benefit. No business figures have been inferred.',
    reviewer:
      '## Review checklist\nThis is a deterministic workflow simulation, not research. Check source provenance, assumptions, conflicts, missing measurements and unrun experiments before any investment decision.',
    director:
      '# Simulation report\n\n**LOCAL WORKFLOW SIMULATION — no AI research was performed.**\n\n## Problem statement\nYour message, library excerpts and saved scenarios have been routed through the specialist workflow. This fixed sample verifies the software pipeline; it does not analyze your company.\n\n## Options matrix\n| Option | Evidence needed | Proposed test |\n|---|---|---|\n| Improve the existing process | Baseline cost and bottlenecks | Measure one operating cycle |\n| Introduce new technology | Physical mechanism and deployment cost | Run a small controlled pilot |\n| Keep the current system | Current performance and risks | Establish a baseline |\n\n## Next investigation\n1. Define a measurable business outcome.\n2. Upload a relevant book excerpt and company baseline.\n3. Save cost scenarios using the calculator.\n4. Configure Azure and rerun in live mode.\n\n## Limitations\nNo sources, hypotheses, calculations, implementation or experiments were independently verified by an AI model in this simulation.',
  };
  return '**SIMULATION — fixed test output, not AI analysis.**\n\n' + (notes[role] ?? notes.reviewer);
}
