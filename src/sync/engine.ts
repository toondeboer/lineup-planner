import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MatchState, Player } from '../core';
import { emptySync, type SyncState, type TeamLink } from '../state/persisted';
import { ApiError, type ApiClient } from './api';
import { applyRemote, diffState, hasChanges, markDirty } from './diff';

/** The parts of the app store the engine reads and writes. */
export interface SyncedState {
  squad: Player[];
  match: MatchState;
  team: TeamLink | null;
  sync: SyncState;
}

export interface SyncStatus {
  /** off: not in a team. saving: changes on their way. offline: will retry. error: the server refused something. */
  state: 'off' | 'synced' | 'saving' | 'offline' | 'error';
  /** Set when this device was found to be out of the team; the squad stayed as a local copy. */
  lostAccess: boolean;
}

export interface SyncEngine {
  /** Saves local changes, then fetches other coaches' changes. */
  syncNow(): Promise<void>;
  /** Resolves when queued work is done (for tests). */
  idle(): Promise<void>;
  stop(): void;
}

const json = (v: unknown) => JSON.stringify(v);
const without = <T>(list: T[], item: T) => list.filter((x) => x !== item);

/**
 * Keeps the local store and the shared team in step:
 * - local edits are marked dirty (persisted) and saved shortly after, one request each;
 * - `syncNow` (on a timer and when the app comes back) saves, then polls for changes;
 * - unsaved local changes win over what the server sends, until they are saved;
 * - when the device turns out to be out of the team, it goes back to local-only.
 * All network work runs one job at a time, so a poll never overlaps a save.
 */
export function createSyncEngine(
  store: StoreApi<SyncedState>,
  api: ApiClient,
  status: StoreApi<SyncStatus> = createSyncStatus(),
  opts: { debounceMs?: number; retryMs?: number } = {},
): SyncEngine {
  const debounceMs = opts.debounceMs ?? 300;
  const retryMs = opts.retryMs ?? 15_000;
  let applyingRemote = false;
  let stopped = false;
  let queue = Promise.resolve();
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  status.setState({ state: store.getState().team ? 'synced' : 'off' });

  const unsubscribe = store.subscribe((next, prev) => {
    if (next.team?.id !== prev.team?.id) status.setState(next.team ? { state: 'synced', lostAccess: false } : { state: 'off' });
    // only edits within the same team; joining, leaving and loading from storage are not edits
    if (applyingRemote || !next.team || !prev.team || next.team.id !== prev.team.id) return;
    if (next.squad === prev.squad && next.match === prev.match) return;
    const changes = diffState(prev, next);
    if (!hasChanges(changes)) return;
    store.setState({ sync: markDirty(next.sync, changes) });
    status.setState({ state: 'saving' });
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => enqueue(flush), debounceMs);
  });

  function enqueue(job: () => Promise<void>): Promise<void> {
    queue = queue.then(async () => {
      if (stopped) return;
      try {
        await job();
      } catch (e) {
        handleError(e);
      }
    });
    return queue;
  }

  function handleError(e: unknown) {
    if (e instanceof ApiError && e.lostAccess) {
      store.setState({ team: null, sync: emptySync });
      status.setState({ state: 'off', lostAccess: true });
    } else if (e instanceof ApiError && e.retryable) {
      status.setState({ state: 'offline' });
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => enqueue(flushAndPoll), retryMs);
    } else {
      status.setState({ state: 'error' });
    }
  }

  /** Still the same team as when the job started? */
  const current = (team: TeamLink) => store.getState().team?.id === team.id;

  /** Accepts a version from a write if it directly follows ours; otherwise the next poll fetches the gap. */
  function acceptVersion(version: number) {
    const { team } = store.getState();
    if (team && version === team.version + 1) store.setState({ team: { ...team, version } });
  }

  function clearSync(change: (sync: SyncState) => SyncState) {
    store.setState({ sync: change(store.getState().sync) });
  }

  /** A request the server refused as invalid would fail forever: drop it instead of retrying. */
  async function attempt(send: () => Promise<{ version: number }>, onDone: () => void) {
    try {
      acceptVersion((await send()).version);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 400)) throw e;
      console.warn('sync: the server refused a change', e.code);
    }
    onDone();
  }

  async function flush() {
    const team = store.getState().team;
    if (!team) return;
    const { sync } = store.getState();
    for (const id of sync.deletedPlayerIds) {
      if (!current(team)) return;
      await attempt(
        () => api.deletePlayer(team.token, id),
        () => clearSync((s) => ({ ...s, deletedPlayerIds: without(s.deletedPlayerIds, id) })),
      );
    }
    for (const id of sync.dirtyPlayerIds) {
      if (!current(team)) return;
      const player = store.getState().squad.find((p) => p.id === id);
      if (!player) {
        clearSync((s) => ({ ...s, dirtyPlayerIds: without(s.dirtyPlayerIds, id) }));
        continue;
      }
      const sent = json(player);
      await attempt(
        () => api.putPlayer(team.token, player),
        () => {
          // edited again while saving? then it stays dirty and goes next time
          if (json(store.getState().squad.find((p) => p.id === id)) === sent) {
            clearSync((s) => ({ ...s, dirtyPlayerIds: without(s.dirtyPlayerIds, id) }));
          }
        },
      );
    }
    const keys = store.getState().sync.dirtyMatchKeys;
    if (keys.length > 0 && current(team)) {
      const { match } = store.getState();
      const fields = Object.fromEntries(keys.map((k) => [k, match[k]])) as Partial<MatchState>;
      await attempt(
        () => api.patchMatch(team.token, fields),
        () => {
          const now = store.getState().match;
          const saved = keys.filter((k) => json(now[k]) === json(fields[k]));
          clearSync((s) => ({ ...s, dirtyMatchKeys: s.dirtyMatchKeys.filter((k) => !saved.includes(k)) }));
        },
      );
    }
    if (current(team)) status.setState({ state: isDirty(store.getState().sync) ? 'saving' : 'synced' });
  }

  async function poll() {
    const team = store.getState().team;
    if (!team) return;
    const result = await api.getTeam(team.token, team.version);
    const now = store.getState();
    if (!now.team || now.team.id !== team.id || 'unchanged' in result) return;
    // a poll answer older than what we already have (our own write landed after it) is stale
    if (result.team.version < now.team.version) return;
    applyingRemote = true;
    try {
      store.setState({
        ...applyRemote(now, result.team),
        team: { ...now.team, version: result.team.version, name: result.team.name, inviteCode: result.team.inviteCode },
      });
    } finally {
      applyingRemote = false;
    }
  }

  async function flushAndPoll() {
    await flush();
    await poll();
    if (store.getState().team) status.setState({ state: isDirty(store.getState().sync) ? 'saving' : 'synced' });
  }

  return {
    syncNow: () => {
      clearTimeout(flushTimer);
      return enqueue(flushAndPoll);
    },
    idle: () => queue,
    stop: () => {
      stopped = true;
      unsubscribe();
      clearTimeout(flushTimer);
      clearTimeout(retryTimer);
    },
  };
}

export function createSyncStatus() {
  return createStore<SyncStatus>(() => ({ state: 'off', lostAccess: false }));
}

const isDirty = (s: SyncState) => s.dirtyPlayerIds.length + s.deletedPlayerIds.length + s.dirtyMatchKeys.length > 0;
