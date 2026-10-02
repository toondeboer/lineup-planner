// Smoke test of the exported web app: plan, override a starter, share image download.
// Run with `npm run e2e` (exports the web build first).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const root = path.resolve('dist');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
let server, browser, base;

before(async () => {
  server = http.createServer((req, res) => {
    let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
    res.setHeader('content-type', types[path.extname(p)] ?? 'application/octet-stream');
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
  browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH });
});

after(async () => {
  await browser?.close();
  server?.close();
});

const names = ['Jan', 'Piet', 'Klaas', 'Henk', 'Sven', 'Tim', 'Rob', 'Bram', 'Daan', 'Luuk', 'Joost', 'Mees', 'Noud', 'Stijn'];
const roles = ['LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW', 'CB', 'CM', 'LB', 'ST'];
const squad = [
  { id: 'gk', name: 'Gerrit', ratings: { GK: 3 } },
  ...names.map((name, i) => ({ id: `p${i}`, name, ratings: { [roles[i]]: 3 } })),
];
const saved = {
  state: {
    squad,
    match: { availableIds: squad.map((p) => p.id), guests: [], formationId: '433', goalkeeperIds: [], pinned: {} },
  },
  version: 1,
};

async function open(route) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/`);
  await page.evaluate((s) => localStorage.setItem('lineup-planner', JSON.stringify(s)), saved);
  await page.goto(`${base}${route}`);
  return { page, errors };
}

test('plan shows 11 starters and substitutions', async () => {
  const { page, errors } = await open('/plan');
  await page.waitForSelector('[aria-label="Slot GK"]');
  assert.equal(await page.locator('[aria-label^="Slot "]').count(), 11);
  assert.ok(await page.getByText('Substitutions').count());
  assert.deepEqual(errors, []);
  await page.close();
});

test('forcing a starter recalculates the plan', async () => {
  const { page } = await open('/plan');
  await page.click('[aria-label="Slot ST"]');
  await page.getByRole('button', { name: 'Tim', exact: true }).click();
  await page.getByRole('button', { name: 'Reset to automatic lineup' }).waitFor();
  await page.getByRole('button', { name: 'Reset to automatic lineup' }).click();
  assert.equal(await page.getByRole('button', { name: 'Reset to automatic lineup' }).count(), 0);
  await page.close();
});

test('share downloads a lineup image', async () => {
  const { page } = await open('/share');
  await page.waitForSelector('[aria-label="Slot GK"]');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Share image and text' }).click(),
  ]);
  assert.equal(download.suggestedFilename(), 'lineup.png');
  const file = await download.path();
  assert.deepEqual([...fs.readFileSync(file).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  await page.close();
});
