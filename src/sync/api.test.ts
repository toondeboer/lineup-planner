import { describe, expect, it } from 'vitest';
import { handle } from '../../server/src/api';
import { MemoryRepo } from '../../server/src/memoryRepo';
import { emptyMatch, type Player } from '../core';
import { ApiError, createApiClient, inviteUrl } from './api';

/** A client wired to the real server code in memory, through a fake `fetch`. */
function client() {
  const deps = { repo: new MemoryRepo(), now: () => new Date('2026-11-25T12:00:00Z') };
  const fetchFn = async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const res = await handle(
      {
        method: init.method ?? 'GET',
        path: u.pathname,
        query: Object.fromEntries(u.searchParams),
        headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
        body: typeof init.body === 'string' ? init.body : undefined,
      },
      deps,
    );
    return new Response(res.body === null ? null : JSON.stringify(res.body), { status: res.status });
  };
  return createApiClient('https://api.test', fetchFn);
}

const squad: Player[] = [
  { id: 'p1', name: 'Noah', ratings: { CB: 3 } },
  { id: 'p2', name: 'Sam', ratings: { GK: 3 } },
];

describe('API client against the server', () => {
  it('creates, previews, joins, edits and polls a team', async () => {
    const api = client();
    const a = await api.createTeam({ name: 'JO17-1', displayName: 'Coach A', squad, match: { ...emptyMatch, availableIds: ['p1'] } });
    expect(a.team.players).toEqual(squad);
    expect(await api.previewInvite(a.team.inviteCode)).toEqual({ teamName: 'JO17-1', playerCount: 2, memberCount: 1 });

    const b = await api.joinTeam(a.team.inviteCode, 'Coach B');
    expect(b.team.members).toHaveLength(2);

    expect(await api.putPlayer(b.token, { id: 'p3', name: 'Luuk', ratings: { CM: 3 } })).toEqual({ version: 3 });
    expect(await api.patchMatch(b.token, { formationId: '442' })).toEqual({ version: 4 });
    expect(await api.getTeam(a.token, 4)).toEqual({ unchanged: true, version: 4 });
    const poll = await api.getTeam(a.token, 2);
    expect('team' in poll && poll.team.players.map((p) => p.name)).toEqual(['Noah', 'Sam', 'Luuk']);

    expect(await api.deletePlayer(a.token, 'p3')).toEqual({ version: 5 });
    expect(await api.renameTeam(a.token, 'JO17-2')).toEqual({ version: 6 });
    const { inviteCode } = await api.resetInvite(a.token);
    expect(inviteCode).not.toBe(a.team.inviteCode);
    expect(await api.removeMember(a.token, b.team.you)).toEqual({ version: 8 });
    expect(await api.deleteTeam(a.token, 'JO17-2')).toEqual({ deleted: true });
  });

  it("turns the server's errors into ApiErrors", async () => {
    const api = client();
    const bad = await api.getTeam('x'.repeat(43)).catch((e) => e);
    expect(bad).toBeInstanceOf(ApiError);
    expect(bad).toMatchObject({ status: 401, code: 'unauthorized', lostAccess: true, retryable: false });
    await expect(api.previewInvite('0'.repeat(32))).rejects.toMatchObject({ status: 404, code: 'invite_not_found', lostAccess: false });
    await expect(api.createTeam({ name: '', displayName: 'A', squad: [], match: emptyMatch })).rejects.toMatchObject({
      status: 400,
      code: 'invalid_name',
    });
  });
});

describe('API client failures', () => {
  it('reports no connection as a retryable network error', async () => {
    const api = createApiClient('https://api.test', async () => {
      throw new TypeError('Network request failed');
    });
    await expect(api.previewInvite('abc')).rejects.toMatchObject({ status: 0, code: 'network', retryable: true });
  });

  it('gives up after the timeout', async () => {
    const hang = (_: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const api = createApiClient('https://api.test', hang, 20);
    await expect(api.previewInvite('abc')).rejects.toMatchObject({ status: 0, code: 'timeout', retryable: true });
  });

  it('copes with a non-JSON error page', async () => {
    const api = createApiClient('https://api.test', async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(api.previewInvite('abc')).rejects.toMatchObject({ status: 502, code: 'http_502', retryable: true });
  });
});

describe('inviteUrl', () => {
  it('links to the join screen of the web app, or the app itself', () => {
    expect(inviteUrl('abc', 'https://lineup.example/')).toBe('https://lineup.example/join/abc');
    expect(inviteUrl('abc', undefined)).toBe('lineup-planner://join/abc');
  });
});
