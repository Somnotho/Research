import '../backend/shared/configuration.ts';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { read_configuration } from '../backend/shared/configuration.ts';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(read_configuration('PUBLIC_ORIGIN'));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByLabel('Owner password').waitFor();
  const manifest = await page.request.get(read_configuration('PUBLIC_ORIGIN') + '/manifest.webmanifest');
  assert.equal((await manifest.json()).display, 'standalone');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'You’re offline', exact: true }).waitFor();
  await page.getByLabel('Offline research notes').fill('Offline verification idea');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByLabel('Offline research notes').waitFor();
  assert.equal(await page.getByLabel('Offline research notes').inputValue(), 'Offline verification idea');
  const cached_urls = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(
      names.map(async (name) => (await (await caches.open(name)).keys()).map((request) => request.url)),
    );
    return requests.flat();
  });
  assert.ok(cached_urls.every((url) => !new URL(url).pathname.startsWith('/api/')));
  await page.getByRole('button', { name: 'Clear offline notes' }).click();
  assert.equal(await page.getByLabel('Offline research notes').inputValue(), '');
  console.log(
    'PASS installable manifest, controlled service worker, offline shell/notes, note deletion and no cached private API responses',
  );
  await context.close();
} finally {
  await browser.close();
}
