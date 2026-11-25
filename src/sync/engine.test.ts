import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { emptyMatch, withoutPlayer, type Player } from '../core';
import { emptySync } from '../state/persisted';
import { createSyncEngine, createSyncStatus, type SyncedState } from './engine';
import { toLink } from './helpers';
import { testServer, type TestServer } from './test-server';

const squad: Player[] = [
  { id: 'p1', name: 'Noah', ratings: { CB: 3 } },
  { id: 'p2', name: 'Sam', ratings: { GK: 3 } },
  { id: 'p3', name: 'Bram', ratings: { ST: 3 } },
];

const engines: { stop(): void }[] = [];
afterEach(() => engines.splice(0).forEach((e) => e.stop()));

/** A phone: its own store, API connection and sync engine. */
function phone(server: TestServer) {
  const { api, net } = server.client();
  const store = createStore<SyncedState>(() => ({ squad: [], match: emptyMatch, team: null, sync: emptySync }));
  const status = createSyncStatus();
  const engine = createSyncEngine(store, api, status, { debounceMs: 0, retryMs: 10 });
  engines.push(engine);
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 20));
    await engine.idle();
  };
  const edit = (change: (s: SyncedState) => Partial<SyncedState>) => store.setState(change(store.getState()));
  return { api, net, store, status, engine, settle, edit, get: () => store.getState() };
}

/** Coach A creates a team from `squad`; coach B joins it. */
async function twoCoaches() {
  const server = testServer();
  const a = phone(server);
  const b = phone(server);
  const created = await a.api.createTeam({ name: 'JO17-1', displayName: 'A', squad, match: { ...emptyMatch, availableIds: ['p1', 'p2', 'p3'] } });
  a.store.setState({ team: toLink(created), squad: created.team.players, match: created.team.match });
  const joined = await b.api.joinTeam(created.team.inviteCode, 'B');
  b.store.setState({ team: toLink(joined), squad: joined.team.players, match: joined.team.match });
  await a.engine.syncNow();
  return { server, a, b };
}

describe('sync engine', () => {
  it('does not treat joining or loading from storage as an edit', async () => {
    const { a, b } = await twoCoaches();
    expect(a.get().sync).toEqual(emptySync);
    expect(b.get().sync).toEqual(emptySync);
    expect(a.status.getState().state).toBe('synced');
  });

  it("saves one coach's edits and shows them to the other", async () => {
    const { a, b } = await twoCoaches();
    a.edit((s) => ({
      squad: [...s.squad.map((p) => (p.id === 'p1' ? { ...p, name: 'Noah B' } : p)), { id: 'p9', name: 'Luuk', ratings: { CM: 3 } }],
      match: { ...s.match, formationId: '442' },
    }));
    expect(a.status.getState().state).toBe('saving');
    await a.settle();
    expect(a.get().sync).toEqual(emptySync);
    expect(a.status.getState().state).toBe('synced');

    await b.engine.syncNow();
    expect(b.get().squad.map((p) => p.name)).toEqual(['Noah B', 'Sam', 'Bram', 'Luuk']);
    expect(b.get().match.formationId).toBe('442');
    expect(b.get().team?.version).toBe(a.get().team?.version);
    expect(b.get().sync).toEqual(emptySync);
  });

  it('removes a deleted player everywhere, including from the match', async () => {
    const { a, b } = await twoCoaches();
    a.edit((s) => ({ squad: s.squad.filter((p) => p.id !== 'p3'), match: withoutPlayer(s.match, 'p3') }));
    await a.settle();
    await b.engine.syncNow();
    expect(b.get().squad.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(b.get().match.availableIds).toEqual(['p1', 'p2']);
  });

  it("keeps a coach's unsaved edit when other coaches' changes arrive", async () => {
    const { a, b } = await twoCoaches();
    b.net.online = false;
    b.edit((s) => ({ squad: s.squad.map((p) => (p.id === 'p2' ? { ...p, name: 'Sam B' } : p)) }));
    await b.settle();
    expect(b.status.getState().state).toBe('offline');

    a.edit((s) => ({ squad: s.squad.map((p) => (p.id === 'p1' ? { ...p, name: 'Noah A' } : p)), match: { ...s.match, seed: 4 } }));
    await a.settle();

    b.net.online = true;
    await b.settle(); // the retry saves B's edit, then polls A's
    expect(b.get().squad.map((p) => p.name)).toEqual(['Noah A', 'Sam B', 'Bram']);
    expect(b.get().match.seed).toBe(4);
    expect(b.status.getState().state).toBe('synced');
    await a.engine.syncNow();
    expect(a.get().squad.map((p) => p.name)).toEqual(['Noah A', 'Sam B', 'Bram']);
  });

  it('keeps edits made offline until the connection is back', async () => {
    const { a, b } = await twoCoaches();
    a.net.online = false;
    a.edit((s) => ({ match: { ...s.match, strictSwaps: true } }));
    await a.settle();
    expect(a.get().sync.dirtyMatchKeys).toEqual(['strictSwaps']);
    expect(a.status.getState().state).toBe('offline');
    a.net.online = true;
    await a.settle();
    expect(a.get().sync).toEqual(emptySync);
    await b.engine.syncNow();
    expect(b.get().match.strictSwaps).toBe(true);
  });

  it('keeps an edit made while the previous version was being saved', async () => {
    const { a, b } = await twoCoaches();
    let once = true;
    a.net.beforeSend = (method) => {
      if (method !== 'PUT' || !once) return;
      once = false;
      // the coach changes the player again while the first save is in flight
      a.edit((s) => ({ squad: s.squad.map((p) => (p.id === 'p1' ? { ...p, name: 'Second' } : p)) }));
    };
    a.edit((s) => ({ squad: s.squad.map((p) => (p.id === 'p1' ? { ...p, name: 'First' } : p)) }));
    await a.settle();
    await a.settle();
    expect(a.get().sync).toEqual(emptySync);
    await b.engine.syncNow();
    expect(b.get().squad[0].name).toBe('Second');
  });

  it('goes back to local-only, keeping the squad, when removed from the team', async () => {
    const { a, b } = await twoCoaches();
    await a.api.removeMember(a.get().team!.token, b.get().team!.memberId);
    await b.engine.syncNow();
    expect(b.get().team).toBeNull();
    expect(b.get().squad).toHaveLength(3);
    expect(b.status.getState()).toEqual({ state: 'off', lostAccess: true });
    // joining a team again clears the notice
    const again = await b.api.joinTeam(a.get().team!.inviteCode, 'B again');
    b.store.setState({ team: toLink(again), squad: again.team.players, match: again.team.match });
    expect(b.status.getState()).toEqual({ state: 'synced', lostAccess: false });
  });

  it('drops a change the server refuses instead of retrying it forever', async () => {
    const { a, b } = await twoCoaches();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    a.edit((s) => ({
      squad: s.squad.map((p) => (p.id === 'p1' ? { ...p, name: '' } : p)),
      match: { ...s.match, formationId: '4231' },
    }));
    await a.settle();
    expect(a.get().sync).toEqual(emptySync);
    expect(warn).toHaveBeenCalledWith('sync: the server refused a change', 'invalid_player');
    await b.engine.syncNow();
    expect(b.get().match.formationId).toBe('4231');
    warn.mockRestore();
  });
});
