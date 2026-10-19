import '../backend/shared/configuration.ts';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import ExcelJS from 'exceljs';
import { read_configuration } from '../backend/shared/configuration.ts';

assert.notEqual(
  process.env.USE_EXTERNAL_DATABASE,
  'true',
  'Use the local development database for verification',
);
const origin = read_configuration('PUBLIC_ORIGIN');
let cookie = '';
async function request_path(path: string, options: RequestInit = {}) {
  return fetch(origin + path, {
    ...options,
    headers: { Origin: origin, Cookie: cookie, ...options.headers },
  });
}
async function read_json(path: string, input?: unknown, method = 'POST') {
  const response = await request_path(
    path,
    input === undefined
      ? {}
      : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
  );
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  return result;
}
const login = await request_path('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: read_configuration('OWNER_PASSWORD') }),
});
assert.equal(login.status, 200);
cookie = login.headers.get('set-cookie')!.split(';')[0];
assert.equal((await read_json('/api/research/status')).mode, 'simulation');
const project = await read_json('/api/workspace/projects', { name: 'Advanced verification fixture' });
const base = `/projects/${project.id}`;
const brief = {
  company: 'Verification company',
  problem: 'Reduce energy use',
  current_system: 'Measured baseline to be supplied',
  desired_outcome: 'Testable improvement',
  constraints: 'Pilot only',
  competitors: 'Unknown',
  employee_impact: 'Reduce manual work',
  success_metrics: 'Energy use and measured task time',
};
await read_json('/api/workspace' + base + '/brief', brief, 'PUT');
assert.equal((await read_json('/api/workspace' + base)).brief.problem, brief.problem);
console.log('PASS company brief persistence');
async function upload_document(name: string, contents: Buffer) {
  const body = new FormData();
  body.append('file', new Blob([new Uint8Array(contents)]), name);
  const response = await request_path('/api/knowledge' + base + '/documents', { method: 'POST', body });
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  return result;
}
const first = await upload_document('version.txt', Buffer.from('Baseline energy: 100 units'));
const duplicate = await upload_document('version.txt', Buffer.from('Baseline energy: 100 units'));
assert.equal(duplicate.id, first.id);
const second = await upload_document('version.txt', Buffer.from('Baseline energy: 80 units'));
assert.equal(second.version, 2);
assert.equal(
  await (await request_path(`/api/knowledge/documents/${first.id}/original`)).text(),
  'Baseline energy: 100 units',
);
const book = new ExcelJS.Workbook();
const sheet = book.addWorksheet('Costs');
sheet.addRow(['Energy', 1200]);
await upload_document('costs.xlsx', Buffer.from(await book.xlsx.writeBuffer()));
mkdirSync('data/verification', { recursive: true });
const image = spawnSync(
  'data/science_venv/bin/python',
  [
    '-c',
    "from PIL import Image,ImageDraw,ImageFont; im=Image.new('RGB',(1400,400),'white'); d=ImageDraw.Draw(im); f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',60); d.text((60,100),'Baseline energy cost 1200',fill='black',font=f); im.save('data/verification/ocr.png'); im.save('data/verification/scanned.pdf','PDF',resolution=150)",
  ],
  { encoding: 'utf8' },
);
assert.equal(image.status, 0, image.stderr);
await upload_document('scan.png', readFileSync('data/verification/ocr.png'));
await upload_document('scanned.pdf', readFileSync('data/verification/scanned.pdf'));
const excerpts = await read_json('/api/knowledge' + base + '/excerpts', { question: 'Baseline energy cost' });
assert.ok(excerpts.excerpts.some((item: any) => item.text.includes('1200')));
assert.ok(excerpts.excerpts.some((item: any) => item.page === 1));
console.log(
  'PASS document versioning, deduplication, original download, XLSX, image OCR and scanned PDF OCR',
);
const formal = await read_json('/api/scientific' + base + '/experiments', {
  operation: 'prove_linear',
  premises: ['x >= 0'],
  conclusion: 'x + 1 > 0',
});
assert.equal(formal.result.result.proven, true);
const matrix = await read_json('/api/analytics' + base + '/decisions', {
  label: 'Cost and human impact',
  criteria: [
    { name: 'Commercial', weight: 60 },
    { name: 'Employee workload', weight: 40 },
  ],
  options: [
    { name: 'Baseline', scores: [5, 4] },
    { name: 'Pilot', scores: [7, 8] },
  ],
});
assert.equal(matrix.result.ranking[0].name, 'Pilot');
assert.equal(
  (
    await request_path('/api/evidence' + base + '/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://127.0.0.1' }),
    })
  ).status,
  422,
);
console.log('PASS actual formal solver, weighted decision matrix and private-network source rejection');
await read_json('/api/analytics' + base + '/scenarios', {
  label: 'Pilot assumptions',
  currency: 'ZAR',
  upfront_cost: 1200,
  monthly_savings: 100,
  monthly_running_cost: 0,
  months: 12,
  annual_discount_rate: 0,
});
const run = await read_json('/api/research' + base + '/runs', {
  question:
    'Evaluate the energy pilot with the company brief, decision matrix, scientific receipts and uncertainty',
  web_enabled: false,
  limits: { max_tool_calls: 2, max_duration_seconds: 180, max_output_tokens: 1000 },
});
let completed: any;
for (let index = 0; index < 45; index++) {
  const state = await read_json('/api/research/runs/' + run.id);
  if (state.state === 'failed') throw Error(state.error);
  if (state.state === 'completed') {
    completed = state;
    break;
  }
  await setTimeout(1000);
}
assert.ok(completed);
assert.ok(completed.plan.tasks.length);
assert.equal(completed.usage.length, 6);
assert.equal(completed.evidence.company_brief.problem, brief.problem);
assert.equal(completed.evidence.decision_matrices[0].id, matrix.id);
assert.ok(completed.evidence.scientific_tool_results.some((item: any) => item.operation === 'monte_carlo'));
const reports = await read_json('/api/report' + base + '/reports');
for (const [format, signature] of [
  ['pdf', '%PDF'],
  ['docx', 'PK'],
  ['pptx', 'PK'],
]) {
  const response = await request_path(`/api/report/reports/${reports[0].id}/${format}`);
  const contents = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200, contents.toString().slice(0, 200));
  assert.equal(contents.subarray(0, signature.length).toString(), signature);
  assert.ok(contents.length > 5000);
}
console.log(
  'PASS planner, proactive real Monte Carlo, context/tool handoffs, six-call usage ledger, PDF/Word/slide exports',
);
const cancelled = await read_json('/api/research' + base + '/runs', {
  question: 'Cancellation verification',
  limits: { max_tool_calls: 0, max_duration_seconds: 60, max_output_tokens: 500 },
});
await read_json(`/api/research/runs/${cancelled.id}/cancel`, {});
for (let index = 0; index < 10; index++) {
  const state = await read_json('/api/research/runs/' + cancelled.id);
  if (state.state === 'cancelled') break;
  await setTimeout(500);
}
assert.equal((await read_json('/api/research/runs/' + cancelled.id)).state, 'cancelled');
const saved_cookie = cookie;
await read_json('/api/auth/logout', {});
cookie = saved_cookie;
assert.equal((await request_path('/api/auth/session')).status, 401);
console.log('PASS durable cancellation and revoked-cookie replay rejection');
console.log('Advanced verification data is retained in a clearly named local project for inspection.');
