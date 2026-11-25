import { describe, expect, it } from 'vitest';
import type { Player } from '../../src/core/types';
import { handle, type TeamView } from '../src/api';
import { hashToken } from '../src/auth';
import { MemoryRepo } from '../src/memoryRepo';

const START = Date.parse('2026-11-25T12:00:00Z');

function setup() {
  const repo = new MemoryRepo();
  let time = START;
  const deps = { repo, now: () => new Date(time) };
  const call = (
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; rawBody?: string; query?: Record<string, string> } = {},
  ) =>
    handle(
      {
        method,
        path,
        query: opts.query ?? {},
        headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
        body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
      },
      deps,
    );
  return { repo, call, advance: (ms: number) => (time += ms) };
}

const squad: Player[] = [
  { id: 'p1', name: 'Noah', ratings: { CB: 3, LB: 1 } },
  { id: 'p2', name: 'Sam', ratings: { GK: 3 } },
  { id: 'p3', name: 'Bram', ratings: { ST: 3 }, isDemo: true },
];

type Created = { team: TeamView; token: string };

async function createTeam(t: ReturnType<typeof setup>, name = 'JO17-1') {
  const res = await t.call('POST', '/teams', {
    body: { name, displayName: 'Coach A', squad, match: { availableIds: ['p1', 'p2', 'p3'], pinned: { ST: 'p3' } } },
  });
  expect(res.status).toBe(201);
  return res.body as Created;
}

async function join(t: ReturnType<typeof setup>, code: string, displayName = 'Coach B') {
  const res = await t.call('POST', `/invites/${code}/join`, { body: { displayName } });
  expect(res.status).toBe(201);
  return res.body as Created;
}

const teamOf = async (t: ReturnType<typeof setup>, token: string) =>
  ((await t.call('GET', '/team', { token })).body as { team: TeamView }).team;

describe('creating a team', () => {
  it('stores the squad and match and returns the team with a token and an invite code', async () => {
    const t = setup();
    const { team, token } = await createTeam(t);
    expect(team.name).toBe('JO17-1');
    expect(team.version).toBe(1);
    expect(team.inviteCode).toMatch(/^[0-9a-f]{32}$/);
    expect(team.players).toEqual(squad);
    expect(team.match).toMatchObject({ availableIds: ['p1', 'p2', 'p3'], pinned: { ST: 'p3' }, formationId: '433' });
    expect(team.members).toEqual([
      { id: team.you, displayName: 'Coach A', joinedAt: '2026-11-25T12:00:00.000Z', lastSeenAt: '2026-11-25T12:00:00.000Z' },
    ]);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('stores only a hash of the token', async () => {
    const t = setup();
    const { team, token } = await createTeam(t);
    const stored = JSON.stringify(await t.repo.team(team.id));
    expect(stored).not.toContain(token);
    expect(stored).toContain(hashToken(token));
  });

  it('works without a squad or match', async () => {
    const t = setup();
    const res = await t.call('POST', '/teams', { body: { name: 'Veterans', displayName: 'Kim' } });
    expect(res.status).toBe(201);
    expect((res.body as Created).team).toMatchObject({ players: [], match: { availableIds: [], rotation: 'lines' } });
  });

  it.each([
    [{ displayName: 'A' }, 'invalid_name'],
    [{ name: '   ', displayName: 'A' }, 'invalid_name'],
    [{ name: 'x'.repeat(61), displayName: 'A' }, 'invalid_name'],
    [{ name: 'Team' }, 'invalid_displayName'],
    [{ name: 'Team', displayName: 'A', squad: [{ id: 'p1', name: 'N', ratings: { CB: 4 } }] }, 'invalid_squad'],
    [{ name: 'Team', displayName: 'A', squad: [{ id: 'p1', name: 'N', ratings: { XX: 1 } }] }, 'invalid_squad'],
    [{ name: 'Team', displayName: 'A', squad: [squad[0], squad[0]] }, 'invalid_squad'],
    [{ name: 'Team', displayName: 'A', squad: [{ ...squad[0], id: 'a b' }] }, 'invalid_squad'],
    [{ name: 'Team', displayName: 'A', match: { rotation: 'random' } }, 'invalid_rotation'],
    [{ name: 'Team', displayName: 'A', match: { hacked: true } }, 'invalid_match'],
  ])('rejects %j with %s', async (body, error) => {
    const res = await setup().call('POST', '/teams', { body });
    expect(res).toEqual({ status: 400, body: { error } });
  });

  it('rejects bodies that are not JSON objects or are too large', async () => {
    const t = setup();
    expect((await t.call('POST', '/teams', { rawBody: '{nope' })).body).toEqual({ error: 'invalid_json' });
    expect((await t.call('POST', '/teams', { rawBody: '[1]' })).body).toEqual({ error: 'invalid_body' });
    expect((await t.call('POST', '/teams', { rawBody: 'x'.repeat(70_000) })).status).toBe(413);
  });
});

describe('invites', () => {
  it('shows a preview for a valid code', async () => {
    const t = setup();
    const { team } = await createTeam(t);
    const res = await t.call('GET', `/invites/${team.inviteCode}`);
    expect(res).toEqual({ status: 200, body: { teamName: 'JO17-1', playerCount: 3, memberCount: 1 } });
  });

  it('gives 404 for unknown and malformed codes', async () => {
    const t = setup();
    await createTeam(t);
    for (const code of ['0'.repeat(32), 'abc', '../team']) {
      expect((await t.call('GET', `/invites/${encodeURIComponent(code)}`)).status).toBe(404);
      expect((await t.call('POST', `/invites/${encodeURIComponent(code)}/join`, { body: { displayName: 'X' } })).status).toBe(404);
    }
  });

  it('lets a new member join and edit the team', async () => {
    const t = setup();
    const a = await createTeam(t);
    const b = await join(t, a.team.inviteCode);
    expect(b.team.id).toBe(a.team.id);
    expect(b.team.members.map((m) => m.displayName)).toEqual(['Coach A', 'Coach B']);
    expect(b.team.version).toBe(2);
    const put = await t.call('PUT', '/players/p9', { token: b.token, body: { name: 'Luuk', ratings: { CM: 3 } } });
    expect(put).toEqual({ status: 200, body: { version: 3 } });
    expect((await teamOf(t, a.token)).players.map((p) => p.name)).toContain('Luuk');
  });

  it('resetting the link stops the old code but keeps existing members', async () => {
    const t = setup();
    const a = await createTeam(t);
    const b = await join(t, a.team.inviteCode);
    const res = await t.call('POST', '/team/invite', { token: b.token });
    const { inviteCode } = res.body as { inviteCode: string };
    expect(inviteCode).not.toBe(a.team.inviteCode);
    expect((await t.call('GET', `/invites/${a.team.inviteCode}`)).status).toBe(404);
    expect((await t.call('GET', `/invites/${inviteCode}`)).status).toBe(200);
    expect((await t.call('GET', '/team', { token: a.token })).status).toBe(200);
    expect((await teamOf(t, a.token)).inviteCode).toBe(inviteCode);
  });
});

describe('authentication', () => {
  it.each([
    ['no header', {}],
    ['an unknown token', { authorization: `Bearer ${'x'.repeat(43)}` }],
    ['a malformed header', { authorization: 'Basic abc' }],
  ])('refuses %s', async (_, headers) => {
    const t = setup();
    await createTeam(t);
    for (const [method, path] of [
      ['GET', '/team'],
      ['PATCH', '/match'],
      ['PUT', '/players/p1'],
      ['DELETE', '/team'],
    ]) {
      const res = await handle({ method, path, query: {}, headers, body: '{}' }, { repo: t.repo, now: () => new Date() });
      expect(res).toEqual({ status: 401, body: { error: 'unauthorized' } });
    }
  });

  it("never lets one team see or change another team's data", async () => {
    const t = setup();
    const a = await createTeam(t, 'Team A');
    const b = await createTeam(t, 'Team B');

    expect((await teamOf(t, a.token)).name).toBe('Team A');
    // a member id of team B is unknown to team A
    expect((await t.call('DELETE', `/members/${b.team.you}`, { token: a.token })).status).toBe(404);
    // writes with A's token land in team A, whatever ids they use
    await t.call('PUT', '/players/p1', { token: a.token, body: { name: 'Renamed', ratings: {} } });
    await t.call('DELETE', '/players/p2', { token: a.token });
    await t.call('PATCH', '/match', { token: a.token, body: { formationId: '442' } });
    const teamB = await teamOf(t, b.token);
    expect(teamB.players).toEqual(squad);
    expect(teamB.match.formationId).toBe('433');
    expect(teamB.version).toBe(1);
    // deleting needs the caller's own team name
    expect((await t.call('DELETE', '/team', { token: a.token, body: { confirmName: 'Team B' } })).status).toBe(400);
    expect((await t.call('GET', '/team', { token: b.token })).status).toBe(200);
  });
});

describe('polling', () => {
  it('answers "unchanged" while the version is the same, and the full team once it changes', async () => {
    const t = setup();
    const a = await createTeam(t);
    const b = await join(t, a.team.inviteCode);
    const poll = (since: number) => t.call('GET', '/team', { token: a.token, query: { since: String(since) } });
    expect((await poll(2)).body).toEqual({ unchanged: true, version: 2 });
    await t.call('PATCH', '/match', { token: b.token, body: { formationId: '442' } });
    const changed = (await poll(2)).body as { team: TeamView };
    expect(changed.team.version).toBe(3);
    expect(changed.team.match.formationId).toBe('442');
    expect(changed.team.you).toBe(a.team.you);
  });

  it('records when a member was last seen, at most once an hour, without bumping the version', async () => {
    const t = setup();
    const a = await createTeam(t);
    t.advance(30 * 60 * 1000);
    expect((await teamOf(t, a.token)).members[0].lastSeenAt).toBe('2026-11-25T12:00:00.000Z');
    t.advance(31 * 60 * 1000);
    const team = await teamOf(t, a.token);
    expect(team.members[0].lastSeenAt).toBe('2026-11-25T13:01:00.000Z');
    expect(team.version).toBe(1);
  });
});

describe('players and match', () => {
  it('uses the id from the path and drops unknown fields', async () => {
    const t = setup();
    const a = await createTeam(t);
    await t.call('PUT', '/players/p1', { token: a.token, body: { id: 'other', name: ' Noah B ', ratings: { CB: 2 }, admin: true } });
    const p1 = (await teamOf(t, a.token)).players.find((p) => p.id === 'p1');
    expect(p1).toEqual({ id: 'p1', name: 'Noah B', ratings: { CB: 2 } });
    expect((await teamOf(t, a.token)).players.some((p) => p.id === 'other')).toBe(false);
  });

  it('removes a deleted player from the match as well', async () => {
    const t = setup();
    const a = await createTeam(t);
    await t.call('PATCH', '/match', { token: a.token, body: { goalkeeperIds: ['p2'] } });
    await t.call('DELETE', '/players/p3', { token: a.token });
    const team = await teamOf(t, a.token);
    expect(team.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(team.match).toMatchObject({ availableIds: ['p1', 'p2'], pinned: {}, goalkeeperIds: ['p2'] });
  });

  it('changes only the match fields that are sent', async () => {
    const t = setup();
    const a = await createTeam(t);
    const b = await join(t, a.team.inviteCode);
    await t.call('PATCH', '/match', { token: a.token, body: { formationId: '442' } });
    await t.call('PATCH', '/match', { token: b.token, body: { strictSwaps: true } });
    expect((await teamOf(t, a.token)).match).toMatchObject({ formationId: '442', strictSwaps: true, pinned: { ST: 'p3' } });
  });

  it('rejects unknown or empty match changes', async () => {
    const t = setup();
    const a = await createTeam(t);
    expect((await t.call('PATCH', '/match', { token: a.token, body: {} })).body).toEqual({ error: 'invalid_match' });
    expect((await t.call('PATCH', '/match', { token: a.token, body: { seed: -1 } })).body).toEqual({ error: 'invalid_seed' });
    expect((await t.call('PATCH', '/match', { token: a.token, body: { goalkeeperIds: ['a', 'b', 'c'] } })).status).toBe(400);
  });

  it('renames the team', async () => {
    const t = setup();
    const a = await createTeam(t);
    expect((await t.call('PATCH', '/team', { token: a.token, body: { name: 'JO17-2' } })).body).toEqual({ version: 2 });
    expect((await teamOf(t, a.token)).name).toBe('JO17-2');
  });
});

describe('leaving and deleting', () => {
  it('a removed member loses access right away', async () => {
    const t = setup();
    const a = await createTeam(t);
    const b = await join(t, a.team.inviteCode);
    expect((await t.call('DELETE', `/members/${b.team.you}`, { token: a.token })).status).toBe(200);
    expect((await t.call('GET', '/team', { token: b.token })).status).toBe(401);
    expect((await teamOf(t, a.token)).members.map((m) => m.displayName)).toEqual(['Coach A']);
  });

  it('the last member leaving deletes the team', async () => {
    const t = setup();
    const a = await createTeam(t);
    expect((await t.call('DELETE', `/members/${a.team.you}`, { token: a.token })).body).toEqual({ deleted: true });
    expect(await t.repo.team(a.team.id)).toBeUndefined();
    expect((await t.call('GET', `/invites/${a.team.inviteCode}`)).status).toBe(404);
  });

  it('deleting the team needs its name and removes everything', async () => {
    const t = setup();
    const a = await createTeam(t);
    const b = await join(t, a.team.inviteCode);
    expect((await t.call('DELETE', '/team', { token: b.token, body: { confirmName: 'wrong' } })).body).toEqual({
      error: 'confirm_name_mismatch',
    });
    expect((await t.call('DELETE', '/team', { token: b.token, body: { confirmName: 'jo17-1' } })).body).toEqual({ deleted: true });
    expect((await t.call('GET', '/team', { token: a.token })).status).toBe(401);
    expect((await t.call('GET', '/team', { token: b.token })).status).toBe(401);
    expect((await t.call('GET', `/invites/${a.team.inviteCode}`)).status).toBe(404);
  });
});

describe('routing', () => {
  it('answers unknown paths, wrong methods and preflight requests', async () => {
    const t = setup();
    expect((await t.call('GET', '/nope')).status).toBe(404);
    expect((await t.call('GET', '/teams')).status).toBe(405);
    expect((await t.call('GET', '/invites/%E0%A4%A')).status).toBe(404);
    expect(await t.call('OPTIONS', '/teams')).toEqual({ status: 204, body: null });
  });
});
