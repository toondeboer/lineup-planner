// Checks a deployed shared-teams API end to end, then deletes the teams it created.
// Usage: API_URL=https://<id>.lambda-url.eu-central-1.on.aws node server/scripts/smoke.mjs
// Optional: ORIGIN=https://your-app.vercel.app also checks that the browser (CORS) preflight is allowed.
import assert from 'node:assert/strict';

const base = process.env.API_URL?.replace(/\/$/, '');
if (!base) {
  console.error('Set API_URL to the ApiUrl output of the deploy.');
  process.exit(2);
}

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}

let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e.message.split('\n').join('\n      ')}`);
  }
}

const stamp = new Date().toISOString().slice(0, 19);
const squad = [
  { id: 'p1', name: 'Noah', ratings: { CB: 3 } },
  { id: 'p2', name: 'Sam', ratings: { GK: 3 } },
];
let a, b, other;

await step('create a team', async () => {
  const res = await call('POST', '/teams', {
    body: { name: `Smoke ${stamp}`, displayName: 'Smoke A', squad, match: { availableIds: ['p1', 'p2'] } },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  a = res.body;
  assert.deepEqual(a.team.players, squad);
});

await step('preview the invite', async () => {
  const res = await call('GET', `/invites/${a.team.inviteCode}`);
  assert.deepEqual(res.body, { teamName: `Smoke ${stamp}`, playerCount: 2, memberCount: 1 });
});

await step('join with the invite', async () => {
  const res = await call('POST', `/invites/${a.team.inviteCode}/join`, { body: { displayName: 'Smoke B' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  b = res.body;
  assert.equal(b.team.id, a.team.id);
});

await step("a member's change reaches the other member's poll", async () => {
  const before = (await call('GET', '/team', { token: a.token })).body.team.version;
  assert.equal((await call('GET', `/team?since=${before}`, { token: a.token })).body.unchanged, true);
  assert.equal((await call('PUT', '/players/p3', { token: b.token, body: { name: 'Luuk', ratings: { CM: 3 } } })).status, 200);
  assert.equal((await call('PATCH', '/match', { token: b.token, body: { formationId: '442' } })).status, 200);
  const res = await call('GET', `/team?since=${before}`, { token: a.token });
  assert.equal(res.body.team.version, before + 2);
  assert.equal(res.body.team.match.formationId, '442');
  assert.ok(res.body.team.players.some((p) => p.name === 'Luuk'));
});

await step('strangers are refused', async () => {
  assert.equal((await call('GET', '/team')).status, 401);
  assert.equal((await call('GET', '/team', { token: 'x'.repeat(43) })).status, 401);
  assert.equal((await call('PATCH', '/match', { body: { formationId: '442' } })).status, 401);
  assert.equal((await call('GET', `/invites/${'0'.repeat(32)}`)).status, 404);
});

await step("another team can't touch this team", async () => {
  other = (await call('POST', '/teams', { body: { name: `Smoke other ${stamp}`, displayName: 'Smoke C' } })).body;
  await call('PUT', '/players/p1', { token: other.token, body: { name: 'Hijack', ratings: {} } });
  await call('DELETE', '/players/p2', { token: other.token });
  assert.equal((await call('DELETE', `/members/${b.team.you}`, { token: other.token })).status, 404);
  const team = (await call('GET', '/team', { token: a.token })).body.team;
  assert.deepEqual(team.players.slice(0, 2), squad);
  assert.equal(team.members.length, 2);
});

await step('resetting the invite stops the old link only', async () => {
  const res = await call('POST', '/team/invite', { token: a.token });
  assert.equal(res.status, 200);
  assert.equal((await call('GET', `/invites/${a.team.inviteCode}`)).status, 404);
  assert.equal((await call('GET', `/invites/${res.body.inviteCode}`)).status, 200);
  assert.equal((await call('GET', '/team', { token: b.token })).status, 200);
});

await step('a removed member loses access', async () => {
  assert.equal((await call('DELETE', `/members/${b.team.you}`, { token: a.token })).status, 200);
  assert.equal((await call('GET', '/team', { token: b.token })).status, 401);
});

if (process.env.ORIGIN) {
  await step(`the browser may call the API from ${process.env.ORIGIN}`, async () => {
    const res = await fetch(`${base}/team`, {
      method: 'OPTIONS',
      headers: {
        origin: process.env.ORIGIN,
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    // the function URL echoes an allowed origin; the local dev server allows any ('*')
    assert.ok(
      [process.env.ORIGIN, '*'].includes(res.headers.get('access-control-allow-origin')),
      `access-control-allow-origin: ${res.headers.get('access-control-allow-origin')}`,
    );
  });
}

await step('delete the test teams', async () => {
  for (const [created, name] of [
    [a, `Smoke ${stamp}`],
    [other, `Smoke other ${stamp}`],
  ]) {
    if (!created) continue;
    const res = await call('DELETE', '/team', { token: created.token, body: { confirmName: name } });
    assert.deepEqual(res.body, { deleted: true });
    assert.equal((await call('GET', '/team', { token: created.token })).status, 401);
  }
});

console.log(failed ? `\n${failed} step(s) failed` : '\nall steps passed');
process.exit(failed ? 1 : 0);
