import '../backend/shared/configuration.ts';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { read_configuration } from '../backend/shared/configuration.ts';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const errors: string[] = [];
mkdirSync('data/screenshots', { recursive: true });
try {
  for (const viewport of [
    { width: 1440, height: 1100 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(read_configuration('PUBLIC_ORIGIN'));
    await page.getByLabel('Owner password').fill(read_configuration('OWNER_PASSWORD'));
    await page.getByRole('button', { name: 'Enter your workspace' }).click();
    await page.getByRole('button', { name: 'New research project' }).waitFor();
    const status = await page.request.get(read_configuration('PUBLIC_ORIGIN') + '/api/research/status');
    assert.equal(
      (await status.json()).mode,
      'simulation',
      'Browser verification must not make paid model calls',
    );
    await page.getByRole('button', { name: 'New research project' }).click();
    await page.getByLabel('Company or research topic').fill(`Browser verification ${viewport.width}`);
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('heading', { name: `Browser verification ${viewport.width}` }).waitFor();
    await page.getByRole('button', { name: 'Company brief', exact: true }).click();
    await page.getByLabel('Problem statement', { exact: true }).fill('Evaluate an energy-efficiency pilot');
    await page.getByRole('button', { name: 'Save company brief', exact: true }).click();
    await page.getByText('Company brief saved.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Document library', exact: true }).click();
    await page.getByLabel('Upload research document').setInputFiles({
      name: 'browser_book.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Energy efficiency must be validated against a measured baseline.'),
    });
    await page.getByText('browser_book.txt', { exact: false }).first().waitFor();
    await page.getByRole('button', { name: 'Analytics & scenarios', exact: true }).click();
    await page.getByLabel('Comparison name', { exact: true }).fill('Browser improvement comparison');
    await page.getByLabel('Current monthly operating cost', { exact: true }).fill('1000');
    await page.getByLabel('Proposed monthly operating cost', { exact: true }).fill('800');
    await page.getByLabel('Additional upfront investment', { exact: true }).fill('1200');
    await page
      .getByLabel('Financial evidence and assumptions', { exact: true })
      .fill('Owner estimate; browser_book.txt provides mechanism');
    await page.getByLabel('Metric name', { exact: true }).fill('Energy consumption');
    await page.getByLabel('Unit', { exact: true }).fill('kWh');
    await page.getByLabel('Current value', { exact: true }).fill('100');
    await page.getByLabel('Proposed value', { exact: true }).fill('80');
    await page.getByLabel('Evidence reference', { exact: true }).fill('browser_book.txt / pilot pending');
    await page
      .getByLabel('Trade-offs, risks and validation plan', { exact: true })
      .fill('Equipment investment and training; validate with a pilot');
    await page.getByRole('button', { name: 'Save improvement comparison', exact: true }).click();
    await page.getByRole('heading', { name: 'Browser improvement comparison', exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      false,
      'Analytics comparison is responsive',
    );
    await page.screenshot({ path: `data/screenshots/analytics_${viewport.width}.png`, fullPage: true });
    await page.getByLabel('Scenario name').fill('Browser cost scenario');
    await page.getByLabel('Upfront investment', { exact: true }).fill('1200');
    await page.getByLabel('Expected monthly savings').fill('100');
    await page.getByRole('button', { name: 'Calculate & save scenario' }).click();
    await page.getByRole('heading', { name: 'Browser cost scenario' }).waitFor();
    await page.getByRole('button', { name: 'Scientific workbench', exact: true }).click();
    await page.getByRole('button', { name: 'Run scientific operation' }).click();
    await page.getByText('EXECUTED TOOL', { exact: true }).first().waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Implementation lab', exact: true }).click();
    await page.getByRole('button', { name: 'Run implementation & tests' }).click();
    await page.getByText('Passed', { exact: true }).first().waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Diagrams & images', exact: true }).click();
    await page.getByLabel('Diagram title').fill('Pilot roadmap');
    await page.getByLabel('Steps, one per line').fill('Measure baseline\nRun pilot\nReview evidence');
    await page.getByRole('button', { name: 'Create diagram' }).click();
    await page.getByRole('img', { name: 'Pilot roadmap' }).waitFor();
    await page.getByRole('button', { name: 'Research & reports', exact: true }).click();
    await page
      .getByLabel('Research question')
      .fill('Evaluate energy efficiency pilot options and missing evidence');
    await page.getByRole('button', { name: 'Explore with the team' }).click();
    await page
      .locator('.conversation')
      .getByText('LOCAL WORKFLOW SIMULATION — no AI research was performed.', { exact: true })
      .waitFor({ timeout: 30000 });
    await page.getByRole('link', { name: 'Word' }).waitFor();
    await page.getByRole('link', { name: 'PDF', exact: false }).waitFor();
    await page.getByRole('heading', { name: 'Research plan', exact: true }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `No page overflow at ${viewport.width}px`);
    await page.screenshot({ path: `data/screenshots/research_${viewport.width}.png`, fullPage: true });
    console.log(
      `PASS browser workflow at ${viewport.width}px: login, brief, upload, baseline/proposal comparison, financial calculation, symbolic computation, disposable code tests, diagram, agent plan, report links and responsive layout`,
    );
    await page.getByRole('button', { name: 'Sign out ↗', exact: true }).click();
    await page.getByLabel('Owner password').waitFor();
    await context.close();
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally {
  await browser.close();
}
