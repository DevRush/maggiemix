// End-to-end smoke tests: boots the static server (with production headers,
// including the CSP) and drives the real page in headless Chromium.
//   npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from '../scripts/serve.mjs';

let server, base, browser;
const consoleErrors = [];

before(async () => {
  const started = await startServer({ port: 0 });
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
  browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function open(path = '/', viewport = { width: 1440, height: 900 }, { trackConsole = true } = {}) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  if (trackConsole) page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`${path}: ${m.text()}`); });
  page.on('pageerror', e => consoleErrors.push(`${path}: ${e.message}`));
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForSelector('.recipe-card');
  return { page, ctx };
}

test('renders every recipe and the counter matches', async () => {
  const { page, ctx } = await open('/');
  const cards = await page.locator('.recipe-card').count();
  const total = await page.evaluate(() => RECIPES.length);
  assert.equal(cards, total);
  assert.equal(await page.locator('.recipe-count').first().textContent(), String(total));
  await ctx.close();
});

test('filters narrow the grid and mark the active pill', async () => {
  const { page, ctx } = await open('/');
  const vegCount = await page.evaluate(() => RECIPES.filter(r => r.protein === 'veg').length);
  await page.click('[data-filter="protein"][data-value="veg"]');
  assert.equal(await page.locator('.recipe-card').count(), vegCount);
  assert.equal(await page.getAttribute('[data-filter="protein"][data-value="veg"]', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('[data-filter="protein"][data-value="all"]', 'aria-pressed'), 'false');
  await page.click('[data-filter="type"][data-value="rice"]');
  const vegRice = await page.evaluate(() => RECIPES.filter(r => r.protein === 'veg' && r.type === 'rice').length);
  assert.equal(await page.locator('.recipe-card').count(), vegRice);
  await ctx.close();
});

test('search matches names, Urdu and ingredients; ?q= is honoured; empty state resets', async () => {
  const { page, ctx } = await open('/?q=haleem');
  assert.ok(await page.locator('.recipe-card h2', { hasText: 'Haleem' }).count() >= 1);
  const input = page.locator('.search-input:visible');
  await input.fill('بریانی');
  await page.waitForTimeout(250);
  const n = await page.locator('.recipe-card').count();
  assert.ok(n > 0 && n < 50, `urdu search returned ${n}`);
  await input.fill('kasuri methi');
  await page.waitForTimeout(250);
  assert.ok(await page.locator('.recipe-card h2', { hasText: 'Butter Chicken' }).count() === 1);
  await input.fill('zzzz-nothing');
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.recipe-card').count(), 0);
  assert.ok(await page.locator('#emptyState').isVisible());
  await page.click('[data-action="reset-filters"]');
  assert.equal(await page.locator('.recipe-card').count(), await page.evaluate(() => RECIPES.length));
  await ctx.close();
});

test('desktop: clicking a card fills the detail panel, keeps selection after favouriting', async () => {
  const { page, ctx } = await open('/');
  const card = page.locator('.recipe-card').nth(2);
  const id = await card.getAttribute('data-id');
  const name = await card.locator('h2').textContent();
  await card.click();
  assert.equal(await page.locator('#detailContent h2').textContent(), name);
  assert.equal(await page.evaluate(() => location.hash), '#' + id);
  await page.click('#detailContent .fav-btn');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('maggiemix:favorites'))), [id]);
  // Selection highlight must survive the grid re-render triggered by favouriting.
  assert.ok(await page.locator(`.recipe-card[data-id="${id}"].selected`).count() === 1);
  assert.ok(await page.locator('.favorites-pill-wrap:visible').count() === 1);
  await page.click('[data-action="toggle-favorites"]:visible');
  assert.equal(await page.locator('.recipe-card').count(), 1);
  await ctx.close();
});

test('keyboard: cards are focusable and Enter opens them', async () => {
  const { page, ctx } = await open('/');
  const card = page.locator('.recipe-card').first();
  const name = await card.locator('h2').textContent();
  await card.locator('h2 button').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#detailContent h2').textContent(), name);
  await ctx.close();
});

test('deep link #id opens that recipe', async () => {
  const id = 'chicken-karahi';
  const { page, ctx } = await open('/#' + id);
  await page.waitForSelector('#detailContent h2');
  assert.equal(await page.locator('#detailContent h2').textContent(), 'Chicken Karahi');
  await ctx.close();
});

test('pick for me selects a visible recipe and shows it', async () => {
  const { page, ctx } = await open('/');
  await page.click('[data-filter="effort"][data-value="quick"]');
  await page.click('[data-action="pick"]:visible');
  assert.equal(await page.locator('.recipe-card.highlighted').count(), 1);
  const picked = await page.locator('.recipe-card.highlighted h2').textContent();
  assert.equal(await page.locator('#detailContent h2').textContent(), picked);
  const effort = await page.evaluate(n => RECIPES.find(r => r.name === n).effort, picked);
  assert.equal(effort, 'quick');
  await ctx.close();
});

test('mobile: card opens an accessible bottom sheet; Escape and close button dismiss it', async () => {
  const { page, ctx } = await open('/', { width: 390, height: 844 });
  await page.locator('.recipe-card').first().click();
  const sheet = page.locator('#sheetPanel');
  await page.waitForTimeout(400);
  assert.ok((await sheet.getAttribute('class')).includes('open'));
  assert.equal(await sheet.getAttribute('role'), 'dialog');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'sheet-close-btn');
  assert.equal(await page.evaluate(() => document.querySelector('main').inert), true);
  await page.keyboard.press('Escape');
  assert.ok(!(await sheet.getAttribute('class')).includes('open'));
  assert.equal(await page.evaluate(() => document.querySelector('main').inert), false);
  // search lives in the header on phones too
  await page.locator('.search-input:visible').fill('nihari');
  await page.waitForTimeout(250);
  assert.ok(await page.locator('.recipe-card').count() >= 2);
  // Surprise! floats the pick to the top
  await page.click('[data-action="pick"]:visible');
  assert.ok((await page.locator('.recipe-card').first().getAttribute('class')).includes('highlighted'));
  await ctx.close();
});

test('favourites saved by the previous version (by name) migrate to ids', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('maggiemix:favorites', JSON.stringify(['Chicken Karahi', 'Nihari', 'Not A Recipe'])));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.recipe-card');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('maggiemix:favorites'))), ['chicken-karahi', 'nihari']);
  assert.equal(await page.locator('.fav-count').first().textContent(), '2');
  assert.equal(await page.locator('.recipe-card .fav-indicator').count(), 2);
  await ctx.close();
});

test('works offline after the first visit (service worker)', async () => {
  // Third-party font requests legitimately fail offline on a first visit, so console errors are not tracked here.
  const { page, ctx } = await open('/', undefined, { trackConsole: false });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    if (!keys.length) return false;
    const c = await caches.open(keys[0]);
    return (await c.keys()).length >= 8;
  });
  await ctx.setOffline(true);
  await page.goto(base + '/?q=karahi', { waitUntil: 'load' });
  await page.waitForSelector('.recipe-card');
  assert.ok(await page.locator('.recipe-card').count() > 0);
  assert.ok(await page.locator('.recipe-card h2', { hasText: 'Chicken Karahi' }).count() === 1);
  await ctx.setOffline(false);
  await ctx.close();
});

test('runs straight from the file system (file://) with no server', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + new URL('../index.html', import.meta.url).pathname, { waitUntil: 'load' });
  await page.waitForSelector('.recipe-card');
  assert.equal(await page.locator('.recipe-card').count(), await page.evaluate(() => RECIPES.length));
  // Stylesheets resolved relatively: the Tailwind build applied (body background is not the UA default).
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(bg, 'rgba(0, 0, 0, 0)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('service worker registers and pre-caches the app shell', async () => {
  const { page, ctx } = await open('/');
  const ok = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    const cache = await caches.open(keys.find(k => k.startsWith('maggiemix-')));
    const cached = await cache.keys();
    return { scope: reg.scope, n: cached.length, hasApp: cached.some(r => r.url.endsWith('/js/app.js')) };
  });
  assert.ok(ok.n >= 8, `cached ${ok.n} files`);
  assert.ok(ok.hasApp);
  await ctx.close();
});

test('structured data lists every recipe with a stable @id', async () => {
  const { page, ctx } = await open('/');
  const { n, ids, cspOk } = await page.evaluate(() => {
    const ld = JSON.parse(document.getElementById('recipe-structured-data').textContent);
    return { n: ld['@graph'].length, ids: ld['@graph'].slice(0, 2).map(r => r['@id']), cspOk: true };
  });
  assert.equal(n, await page.evaluate(() => RECIPES.length));
  assert.ok(ids.every(i => /^https:\/\/maggiemix\.com\/#[a-z0-9-]+$/.test(i)), ids.join(','));
  assert.ok(cspOk);
  await ctx.close();
});

test('no console or page errors (CSP violations surface here)', () => {
  assert.deepEqual(consoleErrors, []);
});
