// End-to-end test of shared teams: two coaches in separate browser profiles, against the local API.
// Run with `npm run e2e:sharing` (builds the web app with EXPO_PUBLIC_API_URL pointing at port 3101,
// starts the API in memory, and serves the build).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const API_PORT = 3101;
const root = path.resolve('dist-shared');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
let web, api, browser, base;

before(async () => {
  // its own process group, so stopping it also stops the node process npm starts
  api = spawn('npm', ['--prefix', 'server', 'run', 'dev'], {
    env: { ...process.env, PORT: String(API_PORT) },
    stdio: 'ignore',
    detached: true,
  });
  for (let i = 0; i < 60; i++) {
    const up = await fetch(`http://localhost:${API_PORT}/team`).then(() => true, () => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  web = http.createServer((req, res) => {
    let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
    res.setHeader('content-type', types[path.extname(p)] ?? 'application/octet-stream');
    res.end(fs.readFileSync(p));
  });
  await new Promise((r) => web.listen(0, r));
  base = `http://localhost:${web.address().port}`;
  // the build must call this test's API (Metro can reuse a cached value; the script passes --clear)
  const bundle = fs.readdirSync(path.join(root, '_expo/static/js/web')).map((f) => fs.readFileSync(path.join(root, '_expo/static/js/web', f), 'utf8')).join('');
  assert.ok(bundle.includes(`localhost:${API_PORT}`), `the web build in ${root} does not use the API on port ${API_PORT}`);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  web?.close();
  if (api?.pid) process.kill(-api.pid);
});

const btn = (page, name) => page.getByRole('button', { name, exact: true });

async function coach() {
  const context = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
}

async function renamePlayer(page, from, to) {
  await btn(page, `Edit ${from}`).click();
  await page.getByLabel('Player name').fill(to);
  await btn(page, 'Save').click();
  await btn(page, `Edit ${to}`).waitFor();
}

test('two coaches share a team, edit it together, and one leaves', { timeout: 120_000 }, async () => {
  const a = await coach();
  await a.page.goto(base);
  await btn(a.page, 'Load demo team (15 players)').click();
  await btn(a.page, 'Share with your coaches').click();
  await a.page.getByLabel('Team name, e.g. JO17-1').fill('JO17-1');
  await a.page.getByLabel('Your name').fill('Coach A');
  await btn(a.page, 'Create shared team').click();
  const link = await a.page.getByText(/\/join\/[0-9a-f]{32}/).textContent();
  await a.page.goBack();

  // B has a player of their own, opens the link and joins: the team's squad replaces theirs
  const b = await coach();
  await b.page.goto(base);
  await btn(b.page, 'Add player').click();
  await b.page.getByLabel('Player name').fill('Local Lars');
  await btn(b.page, 'Save').click();
  await b.page.goto(link);
  await b.page.getByText('Join JO17-1').waitFor();
  await b.page.getByText(/1 player on this phone will be replaced/).waitFor();
  await b.page.getByLabel('Your name').fill('Coach B');
  await btn(b.page, 'Join team').click();
  await b.page.getByText(/up to date/).waitFor();
  assert.equal(await b.page.getByRole('button', { name: /^Edit / }).count(), 15);
  assert.equal(await b.page.getByText('Local Lars').count(), 0);

  // A's edit reaches B through polling, without a reload
  await renamePlayer(a.page, 'Noah', 'Noah A');
  await btn(b.page, 'Edit Noah A').waitFor({ timeout: 25_000 });

  // B edits while offline; it is saved when B is back online and reaches A
  await b.context.setOffline(true);
  await renamePlayer(b.page, 'Sam', 'Sam B');
  await b.page.getByText(/Offline/).waitFor({ timeout: 15_000 });
  await b.context.setOffline(false);
  await b.page.getByText(/up to date/).waitFor({ timeout: 25_000 });
  await btn(a.page, 'Edit Sam B').waitFor({ timeout: 25_000 });

  // B leaves and keeps a copy of the squad; A's coaches list shows only A
  await btn(b.page, 'Team & invite link').click();
  await btn(b.page, 'Leave team').click();
  await btn(b.page, 'Tap again to leave (the squad stays on this device)').click();
  await btn(b.page, 'Share with your coaches').waitFor();
  assert.equal(await b.page.getByRole('button', { name: /^Edit / }).count(), 15);
  await btn(a.page, 'Team & invite link').click();
  await a.page.getByText('Coach A (you)').waitFor();
  assert.equal(await a.page.getByText('Coach B').count(), 0);

  assert.deepEqual([...a.errors, ...b.errors], []);
});

test('an old invite link stops working after a reset', { timeout: 60_000 }, async () => {
  const a = await coach();
  await a.page.goto(base);
  await btn(a.page, 'Share with your coaches').click();
  await a.page.getByLabel('Team name, e.g. JO17-1').fill('Veterans');
  await a.page.getByLabel('Your name').fill('Coach A');
  await btn(a.page, 'Create shared team').click();
  const oldLink = await a.page.getByText(/\/join\/[0-9a-f]{32}/).textContent();
  await btn(a.page, 'Reset link').click();
  await btn(a.page, 'Tap again: the old link stops working').click();
  await a.page.getByText(/New link made/).waitFor();

  const c = await coach();
  await c.page.goto(oldLink);
  await c.page.getByText(/doesn't work any more/).waitFor();
});
