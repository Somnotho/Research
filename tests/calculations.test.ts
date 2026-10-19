import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate_scenario,
  scenario_input,
  draw_cash_flow,
} from '../backend/services/analytics_service/calculations.ts';
import { extract_document, select_excerpts } from '../backend/services/knowledge_service/documents.ts';
import { request_analysis } from '../backend/services/agent_service/model_provider.ts';
import { search_evidence } from '../backend/services/research_service/evidence_provider.ts';
import { Document, Packer, Paragraph } from 'docx';
import { diagram_input, draw_diagram } from '../backend/services/visual_service/diagrams.ts';

const baseline = {
  label: 'Baseline',
  currency: 'ZAR',
  upfront_cost: 1200,
  monthly_savings: 100,
  monthly_running_cost: 0,
  months: 12,
  annual_discount_rate: 0,
};

test('calculates break-even, ROI, NPV and cash flow from explicit financial inputs', () => {
  const result = calculate_scenario(scenario_input.parse(baseline));
  assert.equal(result.net_benefit, 0);
  assert.equal(result.net_present_value, 0);
  assert.equal(result.roi_percent, 0);
  assert.equal(result.payback_months, 12);
  assert.deepEqual(result.cash_flows[0], { month: 0, cumulative_cash: -1200 });
  assert.deepEqual(result.cash_flows[12], { month: 12, cumulative_cash: 0 });
});

test('discounted cash flows use an effective monthly rate', () => {
  const result = calculate_scenario({ ...baseline, months: 1, annual_discount_rate: 0.12 });
  assert.ok(Math.abs(result.net_present_value - (-1200 + 100 / 1.12 ** (1 / 12))) < 0.000001);
});

test('unprofitable and zero-cost scenarios do not invent payback or divide by zero', () => {
  const loss = calculate_scenario({ ...baseline, monthly_running_cost: 120 });
  assert.equal(loss.payback_months, null);
  assert.ok(loss.net_benefit < 0);
  const free = calculate_scenario({ ...baseline, upfront_cost: 0 });
  assert.equal(free.roi_percent, null);
  assert.equal(free.payback_months, 0);
});

test('rejects nonfinite inputs, invalid horizons and SVG injection in currency', () => {
  for (const changes of [
    { monthly_savings: Infinity },
    { months: 0 },
    { months: 1.5 },
    { currency: '<script>' },
    { upfront_cost: -1 },
  ]) {
    assert.equal(scenario_input.safeParse({ ...baseline, ...changes }).success, false);
  }
  assert.match(draw_cash_flow(calculate_scenario(baseline)), /polyline/);
});

test('extracts actual Word content and UTF-8 book text, rejects unsupported uploads', async () => {
  const contents = await Packer.toBuffer(
    new Document({ sections: [{ children: [new Paragraph('Quantum sensing and measurement')] }] }),
  );
  assert.match(await extract_document('book.docx', contents), /Quantum sensing/);
  assert.equal(await extract_document('book.txt', Buffer.from('Energy efficiency')), 'Energy efficiency');
  await assert.rejects(extract_document('program.exe', Buffer.from('binary')), /Supported formats/);
  await assert.rejects(extract_document('empty.txt', Buffer.from('  ')), /No readable text/);
});

test('retrieval ranks relevant excerpts and keeps source offsets', () => {
  const excerpts = select_excerpts(
    [
      { id: 'a', name: 'other.txt', text: 'Cooking recipes' },
      { id: 'b', name: 'physics.txt', text: 'Quantum sensing quantum measurement' },
    ],
    'quantum sensing',
  );
  assert.equal(excerpts[0].filename, 'physics.txt');
  assert.equal(excerpts[0].offset, 0);
  assert.ok(excerpts[0].relevance > excerpts[1].relevance);
});

test('diagrams escape untrusted labels and limit the number of steps', () => {
  const svg = draw_diagram(
    diagram_input.parse({ title: '<script>alert(1)</script>', nodes: ['Baseline', '<img src=x>'] }),
  );
  assert.ok(!svg.includes('<script>'));
  assert.ok(!svg.includes('<img'));
  assert.match(svg, /&lt;script&gt;/);
  assert.equal(diagram_input.safeParse({ title: 'Invalid', nodes: ['Only one'] }).success, false);
});

test('simulation is explicit, deterministic and does not access web providers', async () => {
  const original = process.env.RESEARCH_MODEL_MODE;
  process.env.RESEARCH_MODEL_MODE = 'simulation';
  try {
    const result = await request_analysis('director', 'instructions', 'confidential context');
    assert.match(result.text, /no AI research was performed/);
    assert.equal(result.usage, null);
    assert.deepEqual((await search_evidence('private company')).sources, []);
  } finally {
    if (original === undefined) delete process.env.RESEARCH_MODEL_MODE;
    else process.env.RESEARCH_MODEL_MODE = original;
  }
});

test('Azure adapter sends role deployment and returns provider usage without exposing credentials', async () => {
  const names = ['RESEARCH_MODEL_MODE', 'AZURE_AI_ENDPOINT', 'AZURE_AI_MODEL', 'RESEARCH_AZURE_KEY'];
  const originals = names.map((name) => process.env[name]);
  const original_fetch = globalThis.fetch;
  Object.assign(process.env, {
    RESEARCH_MODEL_MODE: 'azure',
    AZURE_AI_ENDPOINT: 'https://example.openai.azure.com',
    AZURE_AI_MODEL: 'test-deployment',
    RESEARCH_AZURE_KEY: 'test-only-key',
  });
  globalThis.fetch = async (input, options) => {
    assert.equal(String(input), 'https://example.openai.azure.com/openai/v1/chat/completions');
    const body = JSON.parse(options?.body as string);
    assert.equal(body.model, 'test-deployment');
    assert.equal(body.messages[1].content, 'evidence');
    return Response.json({
      choices: [{ message: { content: 'Test analysis' } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    });
  };
  try {
    assert.equal((await request_analysis('science', 'policy', 'evidence')).usage?.completion_tokens, 8);
  } finally {
    globalThis.fetch = original_fetch;
    names.forEach((name, index) => {
      if (originals[index] === undefined) delete process.env[name];
      else process.env[name] = originals[index];
    });
  }
});
