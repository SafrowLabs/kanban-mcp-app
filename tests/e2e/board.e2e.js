// End-to-end tests against the built single file (dist/index.html) in headless Chrome.
// Run with: npm run test:e2e   (builds first). Skips if Chrome is not installed.
// Set CHROME_PATH to use a specific Chrome/Chromium binary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = pathToFileURL(path.join(root, 'dist/index.html')).href;

async function launch() {
  const opts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' };
  try { return await chromium.launch({ ...opts, headless: true }); } catch { return null; }
}

const browser = await launch();

test('kanban e2e', { skip: !browser && 'Chrome not found (set CHROME_PATH)' }, async t => {
  t.after(() => browser.close());
  const tmp = await mkdtemp(path.join(tmpdir(), 'kanban-e2e-'));

  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (!/^(file|blob|data):/.test(r.url())) requests.push(r.url()); });
  await page.goto(URL);

  const ids = col => page.$$eval(`[data-list-for="${col}"] .card`, els => els.map(e => e.dataset.cardId));
  const order = () => page.$$eval('.column', els => els.map(e => e.querySelector('.column-title').textContent));
  const box = sel => page.locator(sel).boundingBox();
  const settle = () => page.waitForTimeout(50); // dialog `close` events fire a task later

  async function mouseDrag(fromSel, to, { release = true } = {}) {
    const a = await box(fromSel);
    await page.mouse.move(a.x + 20, a.y + 10);
    await page.mouse.down();
    await page.mouse.move(a.x + 30, a.y + 20, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    if (release) await page.mouse.up();
  }

  await t.test('renders default board', async () => {
    assert.deepEqual(await ids('col_todo'), ['card_1', 'card_2', 'card_3']);
  });

  await t.test('mouse drag across columns, no dialog opened', async () => {
    const dst = await box('[data-list-for="col_doing"]');
    await mouseDrag('[data-card-id="card_1"]', { x: dst.x + 40, y: dst.y + 20 }, { release: false });
    assert.equal(await page.locator('.ghost').count(), 1);
    assert.equal(await page.locator('.card.placeholder').count(), 1);
    await page.mouse.up();
    assert.deepEqual(await ids('col_doing'), ['card_1']);
    assert.equal(await page.locator('dialog[open]').count(), 0);
  });

  await t.test('reorder within column', async () => {
    const b = await box('[data-card-id="card_2"]');
    await mouseDrag('[data-card-id="card_3"]', { x: b.x + 20, y: b.y + 2 });
    assert.deepEqual(await ids('col_todo'), ['card_3', 'card_2']);
  });

  await t.test('drop outside any column cancels', async () => {
    await mouseDrag('[data-card-id="card_2"]', { x: 1150, y: 780 });
    assert.deepEqual(await ids('col_todo'), ['card_3', 'card_2']);
    await page.waitForTimeout(300); // snap-back animation
    assert.equal(await page.locator('.ghost').count(), 0);
  });

  await t.test('clicking a card does not open the dialog; its edit button does', async () => {
    await page.click('#board .card[data-card-id="card_2"] .card-title');
    await settle();
    assert.equal(await page.locator('#card-dialog[open]').count(), 0);
    await page.click('#board [data-edit-card="card_2"]');
    assert.equal(await page.locator('#card-dialog[open]').count(), 1);
    await page.keyboard.press('Escape');
    await settle();
  });

  await t.test('edit dialog: Enter saves, user text is never HTML, labels have names', async () => {
    await page.click('#board [data-edit-card="card_2"]');
    assert.equal(await page.locator('#card-dialog[open]').count(), 1);
    await page.fill('#card-form [name=title]', '<img src=x onerror="window.pwned=1">');
    await page.fill('#card-form [name=description]', 'desc');
    await page.check('#card-form input[value=red]');
    await page.press('#card-form [name=title]', 'Enter');
    await settle();
    assert.equal(await page.locator('#board [data-card-id="card_2"] .card-title').textContent(), '<img src=x onerror="window.pwned=1">');
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.equal(await page.locator('#board [data-card-id="card_2"] .label[data-label=red]').textContent(), 'Red');
  });

  await t.test('Esc cancels dialog edits', async () => {
    await page.click('#board [data-edit-card="card_2"]');
    await page.fill('#card-form [name=title]', 'nope');
    await page.keyboard.press('Escape');
    await settle();
    assert.notEqual(await page.locator('#board [data-card-id="card_2"] .card-title').textContent(), 'nope');
  });

  await t.test('N adds cards; input stays open; blank ignored; Esc closes', async () => {
    await page.locator('[data-card-id="card_3"]').focus();
    await page.keyboard.press('n');
    await page.keyboard.type('First');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second');
    await page.keyboard.press('Enter');
    await page.keyboard.type('   ');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.focusKey), 'add-card:col_todo');
    await page.keyboard.press('Escape');
    assert.equal((await ids('col_todo')).length, 4);
  });

  await t.test('no card limit: Doing takes every card dragged in; count is a plain number', async () => {
    const todo = await ids('col_todo');
    assert.equal(await page.locator('#column-form [name=wipLimit]').count(), 0, 'no WIP limit setting');
    for (let i = 0; i < todo.length; i++) {
      const doing = await box('[data-list-for="col_doing"]');
      await mouseDrag('[data-list-for="col_todo"] li:first-child .card', { x: doing.x + 40, y: doing.y + doing.height - 5 });
    }
    assert.equal((await ids('col_doing')).length, todo.length + 1);
    assert.equal(await page.locator('[data-column-id="col_doing"] .count').textContent(), String(todo.length + 1));
    assert.equal(await page.locator('[data-column-id="col_doing"] .add-btn').isDisabled(), false);
    for (let i = 0; i < todo.length; i++) await page.click('#undo-btn');
    assert.deepEqual(await ids('col_todo'), todo);
  });

  await t.test('keyboard: pick up, preview across columns, Esc cancels', async () => {
    await page.locator('[data-card-id="card_3"]').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('.card.lifted').count(), 1);
    await page.keyboard.press('ArrowRight');
    assert.ok((await ids('col_doing')).includes('card_3'));
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowDown');
    assert.equal((await ids('col_todo'))[1], 'card_3');
    await page.keyboard.press('Escape');
    assert.equal((await ids('col_todo'))[0], 'card_3');
    assert.deepEqual(await ids('col_doing'), ['card_1']);
  });

  await t.test('keyboard: drop keeps focus and is announced', async () => {
    await page.locator('[data-card-id="card_3"]').focus();
    for (const key of ['Space', 'ArrowRight', 'ArrowDown', 'Space']) await page.keyboard.press(key);
    assert.deepEqual(await ids('col_doing'), ['card_1', 'card_3']);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.cardId), 'card_3');
    await page.waitForTimeout(100);
    assert.match(await page.locator('#live').textContent(), /Dropped .* in Doing, position 2/);
  });

  await t.test('undo / redo shortcuts', async () => {
    await page.keyboard.press('Control+z');
    assert.deepEqual(await ids('col_doing'), ['card_1']);
    await page.keyboard.press('Control+Shift+z');
    assert.deepEqual(await ids('col_doing'), ['card_1', 'card_3']);
  });

  await t.test('columns: add, move, rename, delete with confirm, undo', async () => {
    await page.click('[data-action=start-add-column]');
    await page.keyboard.type('Review');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    assert.deepEqual(await order(), ['To Do', 'Doing', 'Done', 'Review']);
    await page.locator('.column').nth(3).locator('[data-action=edit-column]').click();
    await page.click('#column-left');
    await page.fill('#column-form [name=title]', 'QA');
    await page.click('#column-form button[value=save]');
    await settle();
    assert.deepEqual(await order(), ['To Do', 'Doing', 'QA', 'Done']);
    await page.locator('[data-column-id="col_todo"] [data-action=edit-column]').click();
    await page.click('#column-delete');
    assert.match(await page.locator('#confirm-message').textContent(), /3 cards/);
    await page.click('#confirm-ok');
    await settle();
    assert.deepEqual(await order(), ['Doing', 'QA', 'Done']);
    await page.click('#undo-btn');
    assert.deepEqual(await order(), ['To Do', 'Doing', 'QA', 'Done']);
  });

  await t.test('header: search dims non-matches, Add card, empty state, theme switch', async () => {
    await page.fill('#search-input', 'keyboard');
    assert.equal(await page.locator('[data-card-id="card_3"].dim').count(), 0);
    assert.equal(await page.locator('[data-card-id="card_1"].dim').count(), 1);
    assert.deepEqual(await ids('col_doing'), ['card_1', 'card_3'], 'search never reorders or hides cards');
    await page.press('#search-input', 'Escape');
    assert.equal(await page.locator('.card.dim').count(), 0);

    await page.click('#add-card-btn');
    assert.equal(await page.locator('[data-form="add-card"][data-column-id="col_todo"]').count(), 1);
    await page.keyboard.press('Escape');

    const qa = page.locator('.column', { has: page.locator('.column-title', { hasText: 'QA' }) });
    assert.equal(await qa.locator('.empty-state').count(), 1);
    assert.equal(await qa.locator('.card').count(), 0);

    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    const before = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    await page.click('#theme-btn');
    const after = before === 'dark' ? 'light' : 'dark';
    assert.equal(await theme(), after);
    assert.equal(await page.getAttribute('#theme-btn', 'aria-pressed'), String(after === 'dark'));
    assert.equal(await page.evaluate(() => localStorage.getItem('kanban:theme')), after);
    await page.click('#theme-btn');
    assert.equal(await theme(), before);
  });

  let exported;
  await t.test('board survives reload', async () => {
    await page.waitForTimeout(400); // debounced save
    exported = await page.evaluate(() => localStorage.getItem('kanban:v1'));
    await page.reload();
    assert.deepEqual(await order(), ['To Do', 'Doing', 'QA', 'Done']);
    assert.deepEqual(await ids('col_doing'), ['card_1', 'card_3']);
  });

  await t.test('export -> import round-trips exactly', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
    assert.equal(download.suggestedFilename(), 'board.json');
    const file = path.join(tmp, 'board.json');
    await download.saveAs(file);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), JSON.parse(exported));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    assert.deepEqual(await order(), ['To Do', 'Doing', 'Done']);
    await page.setInputFiles('#import-input', file);
    await page.waitForTimeout(100);
    assert.deepEqual(await order(), ['To Do', 'Doing', 'QA', 'Done']);
    await page.waitForTimeout(400);
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kanban:v1'))), JSON.parse(exported));
  });

  await t.test('invalid import is rejected and board kept', async () => {
    const bad = path.join(tmp, 'bad.json');
    await writeFile(bad, JSON.stringify({ version: 1, board: { title: 'x' }, columnOrder: ['a'], columns: {}, cards: {} }));
    await page.setInputFiles('#import-input', bad);
    await page.waitForTimeout(100);
    assert.deepEqual(await order(), ['To Do', 'Doing', 'QA', 'Done']);
    assert.match(await page.locator('#toast').textContent(), /Import failed/);
  });

  await t.test('reset asks first; cancel keeps the board, confirm restores the starter board, undo reverts', async () => {
    await page.click('#reset-btn');
    assert.equal(await page.locator('#confirm-dialog[open]').count(), 1);
    assert.equal(await page.locator('#confirm-ok').textContent(), 'Reset');
    await page.click('#confirm-dialog [data-close]');
    await settle();
    assert.deepEqual(await order(), ['To Do', 'Doing', 'QA', 'Done']);

    await page.click('#reset-btn');
    await page.click('#confirm-ok');
    await settle();
    assert.deepEqual(await order(), ['To Do', 'Doing', 'Done']);
    assert.deepEqual(await ids('col_todo'), ['card_1', 'card_2', 'card_3']);
    await page.click('#undo-btn');
    assert.deepEqual(await order(), ['To Do', 'Doing', 'QA', 'Done']);
    await page.waitForTimeout(400); // let the debounced save land before the next test
  });

  await t.test('corrupt storage -> fresh board with error, no crash', async () => {
    await page.evaluate(() => localStorage.setItem('kanban:v1', '{garbage'));
    await page.reload();
    assert.deepEqual(await order(), ['To Do', 'Doing', 'Done']);
    assert.match(await page.locator('#toast').textContent(), /could not be read/);
  });

  await t.test('deleting every column shows empty state; N opens add column', async () => {
    for (let i = 0; i < 3; i++) {
      await page.locator('.column').nth(0).locator('[data-action=edit-column]').click();
      await page.click('#column-delete');
      await page.click('#confirm-ok');
      await settle();
    }
    assert.equal(await page.locator('.empty-board').count(), 1);
    await page.keyboard.press('n');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.focusKey), 'add-column');
  });

  await t.test('blocked storage -> works in memory with "Not saved" badge', async () => {
    const c = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await c.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    });
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL);
    assert.equal(await p.locator('#save-status').isVisible(), true);
    await p.click('[data-action=start-add-card][data-column-id=col_todo]');
    await p.keyboard.type('in memory');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(400);
    assert.equal(await p.locator('#board .card').count(), 4);
    assert.deepEqual(errs, []);
    await c.close();
  });

  await t.test('mobile 375px: no page scroll sideways, touch hold-drag, tap edit opens', async () => {
    const c = await browser.newContext({ viewport: { width: 375, height: 700 }, hasTouch: true, isMobile: true });
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL);
    const [scrollWidth, innerWidth] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.ok(scrollWidth <= innerWidth);

    const cdp = await c.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const from = await p.locator('[data-card-id="card_2"]').boundingBox();
    const to = await p.locator('[data-card-id="card_3"]').boundingBox();
    const x = from.x + 20;
    const y0 = from.y + 10;
    const y1 = to.y + to.height - 4;
    await touch('touchStart', x, y0);
    await p.waitForTimeout(400); // press and hold
    for (let i = 1; i <= 10; i++) await touch('touchMove', x, y0 + (y1 - y0) * i / 10);
    await touch('touchEnd');
    await p.waitForTimeout(50);
    assert.deepEqual(await p.$$eval('[data-list-for="col_todo"] .card', els => els.map(e => e.dataset.cardId)), ['card_1', 'card_3', 'card_2']);

    const c1 = await p.locator('[data-card-id="card_1"]').boundingBox();
    // Card center: the drag auto-scrolled the list, so the card's top edge can sit under the column header.
    await p.touchscreen.tap(c1.x + 20, c1.y + c1.height / 2);
    await p.waitForTimeout(50);
    assert.equal(await p.locator('#card-dialog[open]').count(), 0, 'tapping the card body does not open it');
    const edit = await p.locator('[data-edit-card="card_1"]').boundingBox();
    await p.touchscreen.tap(edit.x + edit.width / 2, edit.y + edit.height / 2);
    assert.equal(await p.locator('#card-dialog[open]').count(), 1);
    assert.deepEqual(errs, []);
    await c.close();
  });

  await t.test('no errors and no network requests', () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
  });
});
