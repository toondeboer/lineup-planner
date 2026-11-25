import type { MatchState, Player, TeamView } from '../core';
import type { SyncState } from '../state/persisted';

interface Local {
  squad: Player[];
  match: MatchState;
}

/** What changed between two local states, to be saved to the shared team. */
export interface Changes {
  upsertPlayerIds: string[];
  deletedPlayerIds: string[];
  matchKeys: (keyof MatchState)[];
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function diffState(prev: Local, next: Local): Changes {
  const before = new Map(prev.squad.map((p) => [p.id, p]));
  const after = new Map(next.squad.map((p) => [p.id, p]));
  const upsertPlayerIds = next.squad.filter((p) => !same(before.get(p.id), p)).map((p) => p.id);
  const deletedPlayerIds = prev.squad.filter((p) => !after.has(p.id)).map((p) => p.id);
  const matchKeys =
    prev.match === next.match
      ? []
      : (Object.keys(next.match) as (keyof MatchState)[]).filter((k) => !same(prev.match[k], next.match[k]));
  return { upsertPlayerIds, deletedPlayerIds, matchKeys };
}

export const hasChanges = (c: Changes) =>
  c.upsertPlayerIds.length + c.deletedPlayerIds.length + c.matchKeys.length > 0;

const union = <T>(a: T[], b: T[]) => [...new Set([...a, ...b])];

/** Adds changes to the not-yet-saved set. A later delete cancels an upsert of that player, and the reverse. */
export function markDirty(sync: SyncState, c: Changes): SyncState {
  return {
    dirtyPlayerIds: union(sync.dirtyPlayerIds, c.upsertPlayerIds).filter((id) => !c.deletedPlayerIds.includes(id)),
    deletedPlayerIds: union(sync.deletedPlayerIds, c.deletedPlayerIds).filter((id) => !c.upsertPlayerIds.includes(id)),
    dirtyMatchKeys: union(sync.dirtyMatchKeys, c.matchKeys),
  };
}

/**
 * The team from the server, with this device's unsaved changes on top: they win, because they will be
 * saved next. The squad keeps the server's order; new local players go at the end.
 */
export function applyRemote(local: Local & { sync: SyncState }, remote: TeamView): Local {
  const { dirtyPlayerIds, deletedPlayerIds, dirtyMatchKeys } = local.sync;
  const localById = new Map(local.squad.map((p) => [p.id, p]));
  const squad = remote.players
    .filter((p) => !deletedPlayerIds.includes(p.id))
    .map((p) => (dirtyPlayerIds.includes(p.id) ? (localById.get(p.id) ?? p) : p));
  const remoteIds = new Set(remote.players.map((p) => p.id));
  for (const id of dirtyPlayerIds) {
    const p = localById.get(id);
    if (p && !remoteIds.has(id)) squad.push(p);
  }
  const match = { ...remote.match };
  for (const key of dirtyMatchKeys) (match as Record<string, unknown>)[key] = local.match[key];
  return { squad, match };
}
