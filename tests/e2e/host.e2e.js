// The built board inside a minimal MCP Apps host (what ChatGPT / Claude do): the board
// is loaded into a sandboxed iframe, the host answers the ui/initialize handshake over
// postMessage, and the board must report its size and follow the host theme.
// Run with: npm run test:e2e   (builds first). Skips if Chrome is not installed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');

async function launch() {
  const opts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' };
  try { return await chromium.launch({ ...opts, headless: true }); } catch { return null; }
}

const browser = await launch();

const hostPage = `<!doctype html><body><script>
  window.received = [];
  const frame = document.createElement('iframe');
  frame.sandbox = 'allow-scripts allow-same-origin';
  frame.style.cssText = 'width:900px;height:150px;border:0';
  addEventListener('message', e => {
    if (e.source !== frame.contentWindow) return;
    const msg = e.data;
    window.received.push(msg);
    if (msg.method === 'ui/notifications/size-changed') frame.style.height = msg.params.height + 'px';
    if (msg.method === 'ui/initialize') {
      frame.contentWindow.postMessage({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: msg.params.protocolVersion,
        hostInfo: { name: 'test-host', version: '1.0.0' },
        hostCapabilities: {},
        hostContext: { theme: 'dark' },
      } }, '*');
    }
  });
  document.body.append(frame);
  window.loadBoard = html => { frame.srcdoc = html; };
</script></body>`;

test('board inside an MCP Apps host', { skip: !browser && 'Chrome not found (set CHROME_PATH)' }, async t => {
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent(hostPage);
  await page.evaluate(h => window.loadBoard(h), html);

  const methods = () => page.evaluate(() => window.received.map(m => m.method ?? 'response'));
  await page.waitForFunction(() => window.received.some(m => m.method === 'ui/notifications/size-changed'));

  const seen = await methods();
  assert.ok(seen.includes('ui/initialize'), 'board starts the handshake');
  assert.ok(seen.includes('ui/notifications/initialized'), 'board completes the handshake');

  const frame = page.frames().find(f => f !== page.mainFrame());
  await frame.waitForSelector('.column');
  await frame.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.ok(await frame.evaluate(() => document.documentElement.classList.contains('embedded')));

  const height = await page.evaluate(() => parseFloat(document.querySelector('iframe').style.height));
  assert.ok(height >= 500, `host resized the iframe to fit the board (got ${height}px)`);

  // ChatGPT keeps pulling focus back to its own composer, which blurs the iframe mid-drag.
  // Dragging across columns must still work.
  await page.evaluate(() => {
    const composer = document.createElement('input');
    document.body.prepend(composer);
    window.stealFocus = setInterval(() => composer.focus(), 30);
  });
  const ids = col => frame.$$eval(`[data-list-for="${col}"] .card`, els => els.map(e => e.dataset.cardId));
  async function drag(cardId, colId) {
    const a = await frame.locator(`.card[data-card-id="${cardId}"]`).boundingBox();
    const b = await frame.locator(`.column[data-column-id="${colId}"]`).boundingBox();
    await page.mouse.move(a.x + 20, a.y + 10);
    await page.mouse.down();
    await page.mouse.move(a.x + 30, a.y + 20, { steps: 3 });
    await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(50);
  }
  await drag('card_1', 'col_doing');
  assert.deepEqual(await ids('col_doing'), ['card_1']);
  await drag('card_1', 'col_done');
  assert.deepEqual(await ids('col_done'), ['card_1']);
  await drag('card_2', 'col_done');
  assert.deepEqual((await ids('col_done')).sort(), ['card_1', 'card_2']);
  assert.deepEqual(await ids('col_todo'), ['card_3']);

  // Release outside the iframe: the drop still lands and no ghost is left behind.
  const a = await frame.locator('.card[data-card-id="card_3"]').boundingBox();
  const b = await frame.locator('.column[data-column-id="col_doing"]').boundingBox();
  await page.mouse.move(a.x + 20, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 12 });
  await page.mouse.move(b.x + b.width / 2, 2000, { steps: 4 });   // leave the iframe
  await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 4 }); // come back
  await page.mouse.up();
  await page.waitForTimeout(50);
  assert.deepEqual(await ids('col_doing'), ['card_3']);
  assert.equal(await frame.locator('.ghost').count(), 0);
  await page.evaluate(() => clearInterval(window.stealFocus));

  assert.deepEqual(errors, []);
});
