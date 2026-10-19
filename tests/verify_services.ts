import '../backend/shared/configuration.ts';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { read_configuration } from '../backend/shared/configuration.ts';
import { PrismaClient } from '../backend/services/workspace_service/generated/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { read_database_url } from '../backend/shared/configuration.ts';

const origin = read_configuration('PUBLIC_ORIGIN');
let cookie = '';
let project_id = '';
const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: read_database_url('workspace') }, { schema: 'workspace' }),
});

async function request_path(path: string, options: RequestInit = {}) {
  return fetch(origin + path, {
    ...options,
    headers: { Origin: origin, Cookie: cookie, ...options.headers },
  });
}
async function read_json(path: string, options: RequestInit = {}) {
  const response = await request_path(path, options);
  const result = await response.json();
  assert.ok(response.ok, `${path}: HTTP ${response.status}: ${JSON.stringify(result)}`);
  return result;
}
function create_body(input: unknown) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) };
}

try {
  assert.equal((await request_path('/api/workspace/projects')).status, 401);
  assert.equal((await fetch('http://127.0.0.1:4101/projects')).status, 401);
  assert.equal((await fetch('http://127.0.0.1:4201/health')).status, 401);
  assert.notEqual((await request_path('/api%2fworkspace/projects')).status, 200);
  assert.equal(
    (
      await request_path('/api/auth/login', {
        ...create_body({ password: 'incorrect' }),
        headers: { Origin: 'https://wrong.example', 'Content-Type': 'application/json' },
      })
    ).status,
    403,
  );
  const login = await request_path(
    '/api/auth/login',
    create_body({ password: read_configuration('OWNER_PASSWORD') }),
  );
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie')!.split(';')[0];
  assert.ok(login.headers.get('set-cookie')?.includes('HttpOnly'));
  const status = await read_json('/api/research/status');
  assert.equal(
    status.mode,
    'simulation',
    'Run integration tests only in simulation mode to avoid paid calls',
  );
  console.log('PASS owner authentication, origin checks and internal-service isolation');

  const project = await read_json(
    '/api/workspace/projects',
    create_body({ name: 'Integration verification fixture' }),
  );
  project_id = project.id;
  assert.equal((await read_json(`/api/workspace/projects/${project_id}`)).name, project.name);
  const file = new FormData();
  file.append(
    'file',
    new Blob([
      'Quantum sensor proposals require physical mechanism validation. Baseline operating cost is a user estimate.',
    ]),
    'verification_book.txt',
  );
  const document = await read_json(`/api/knowledge/projects/${project_id}/documents`, {
    method: 'POST',
    body: file,
  });
  assert.ok(document.characters > 20);
  const excerpts = await read_json(
    `/api/knowledge/projects/${project_id}/excerpts`,
    create_body({ question: 'quantum sensor validation' }),
  );
  assert.equal(excerpts.excerpts[0].filename, 'verification_book.txt');
  const unsupported = new FormData();
  unsupported.append('file', new Blob(['not a document']), 'test.exe');
  assert.equal(
    (
      await request_path(`/api/knowledge/projects/${project_id}/documents`, {
        method: 'POST',
        body: unsupported,
      })
    ).status,
    422,
  );
  console.log('PASS project persistence, upload, retrieval provenance and unsupported-file rejection');

  const scenario = await read_json(
    `/api/analytics/projects/${project_id}/scenarios`,
    create_body({
      label: 'Verification assumptions',
      currency: 'ZAR',
      upfront_cost: 1200,
      monthly_savings: 100,
      monthly_running_cost: 0,
      months: 12,
      annual_discount_rate: 0,
    }),
  );
  assert.equal(scenario.result.net_benefit, 0);
  const chart = await request_path(`/api/analytics/scenarios/${scenario.id}/chart`);
  assert.match(chart.headers.get('content-type') ?? '', /svg/);
  assert.match(await chart.text(), /polyline/);
  const comparison = await read_json(
    `/api/analytics/projects/${project_id}/comparisons`,
    create_body({
      label: 'Evidence-backed infrastructure comparison',
      currency: 'ZAR',
      months: 12,
      annual_discount_rate: 0,
      upfront_cost: 1200,
      baseline_monthly_cost: 1000,
      proposal_monthly_cost: 800,
      financial_evidence: 'verification_book.txt and owner financial assumptions',
      tradeoffs: 'Stress may increase; pilot and survey required',
      measurements: [
        {
          name: 'Latency',
          unit: 'ms',
          baseline: 100,
          proposal: 80,
          direction: 'lower',
          evidence_status: 'estimate',
          evidence_reference: 'verification_book.txt / unrun pilot',
        },
        {
          name: 'Employee stress',
          unit: 'score/10',
          baseline: 3,
          proposal: 6,
          direction: 'lower',
          evidence_status: 'estimate',
          evidence_reference: 'Owner hypothesis; survey pending',
        },
      ],
    }),
  );
  assert.equal(comparison.result.net_present_value, 1200);
  assert.equal(comparison.result.measurements[1].outcome, 'worsens');
  assert.equal((await read_json(`/api/analytics/projects/${project_id}/comparisons`))[0].id, comparison.id);
  console.log('PASS computed financial scenario and authenticated SVG export');

  const diagram = await read_json(
    `/api/visual/projects/${project_id}/diagrams`,
    create_body({ title: 'Verification roadmap', nodes: ['Baseline', 'Pilot', 'Review'] }),
  );
  const image = await request_path(`/api/visual/assets/${diagram.id}/content`);
  assert.match(image.headers.get('content-type') ?? '', /svg/);
  assert.match(await image.text(), /Verification roadmap/);
  assert.equal(
    (await request_path(`/api/visual/projects/${project_id}/images`, create_body({ prompt: 'Test image' })))
      .status,
    503,
  );
  console.log('PASS diagram generation and live-image gating in simulation');

  const run = await read_json(
    `/api/research/projects/${project_id}/runs`,
    create_body({
      question: 'Explore quantum sensor feasibility and implementation risks',
      web_enabled: false,
    }),
  );
  let completed;
  for (let attempt = 0; attempt < 45; attempt++) {
    const state = await read_json(`/api/research/runs/${run.id}`);
    if (state.state === 'failed') throw new Error(state.error);
    if (state.state === 'completed') {
      completed = state;
      break;
    }
    await setTimeout(1000);
  }
  assert.ok(completed, 'Run should complete');
  assert.match(completed.answer, /LOCAL WORKFLOW SIMULATION/);
  for (const agent of ['science', 'commercial', 'analytics', 'reviewer', 'director']) {
    assert.ok(
      completed.steps.some(
        (step: { agent: string; state: string }) => step.agent === agent && step.state === 'completed',
      ),
    );
  }
  const reviewer = completed.steps.findIndex(
    (step: { agent: string; state: string }) => step.agent === 'reviewer' && step.state === 'running',
  );
  const last_specialist = Math.max(
    ...completed.steps.map((step: { agent: string; state: string }, index: number) =>
      ['science', 'commercial', 'analytics'].includes(step.agent) && step.state === 'completed' ? index : -1,
    ),
  );
  assert.ok(reviewer > last_specialist, 'Reviewer must receive all specialist findings');
  assert.equal(completed.evidence.scenarios[0].id, scenario.id);
  assert.equal(completed.evidence.improvement_comparisons[0].id, comparison.id);
  const messages = await read_json(`/api/research/projects/${project_id}/messages`);
  assert.equal(messages.length, 2);
  console.log('PASS durable research queue, specialist handoffs, reviewer ordering and saved conversation');

  const reports = await read_json(`/api/report/projects/${project_id}/reports`);
  assert.equal(reports.length, 1);
  const markdown = await request_path(`/api/report/reports/${reports[0].id}/md`);
  const contents = await markdown.text();
  assert.match(contents, /verification_book.txt/);
  assert.match(contents, /Baseline and proposed outcomes/);
  assert.match(contents, /worsens/);
  assert.match(contents, /survey pending/);
  // Changing the project afterward must not rewrite this report's evidence snapshot.
  await read_json(
    `/api/analytics/projects/${project_id}/comparisons`,
    create_body({
      ...comparison.result,
      label: 'Later comparison not in original report',
      upfront_cost: 999999,
    }),
  );
  const snapshot = await request_path(`/api/report/reports/${reports[0].id}/md`);
  assert.equal(await snapshot.text(), contents);
  const word = await request_path(`/api/report/reports/${reports[0].id}/docx`);
  const bytes = Buffer.from(await word.arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  assert.ok(bytes.length > 1000);
  const foreign_keys = await database.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*)::bigint AS count FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND table_schema IN ('workspace','knowledge','research','analytics','report','visual','scientific','evidence','execution')`;
  assert.equal(Number(foreign_keys[0].count), 0);
  console.log('PASS report provenance, Word export and absence of cross-service foreign keys');
  await read_json('/api/auth/logout', create_body({}));
  cookie = '';
  assert.equal((await request_path('/api/report/projects/' + project_id + '/reports')).status, 401);
  console.log('PASS logout and export access protection');
} finally {
  if (project_id) {
    await database.$executeRaw`DELETE FROM research.research_step WHERE run_id IN (SELECT id FROM research.research_run WHERE project_id = ${project_id}::uuid)`;
    for (const [schema, table] of [
      ['execution', 'code_test'],
      ['evidence', 'web_source'],
      ['scientific', 'experiment'],
      ['analytics', 'decision_matrix'],
      ['analytics', 'improvement_comparison'],
      ['research', 'research_run'],
      ['research', 'message'],
      ['report', 'report'],
      ['analytics', 'scenario'],
      ['visual', 'visual_asset'],
      ['knowledge', 'document'],
      ['workspace', 'project'],
    ]) {
      const column = schema === 'workspace' ? 'id' : 'project_id';
      // Identifiers are a fixed developer-controlled list; project_id is a bound parameter.
      await database.$executeRawUnsafe(
        `DELETE FROM "${schema}"."${table}" WHERE "${column}" = $1::uuid`,
        project_id,
      );
    }
  }
  await database.$disconnect();
}
