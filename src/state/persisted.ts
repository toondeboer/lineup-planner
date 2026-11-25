import { emptyMatch, type MatchState } from '../core';

/** This device's membership of a shared team. */
export interface TeamLink {
  id: string;
  name: string;
  inviteCode: string;
  /** Secret that proves this device is a member. Never shown or logged. */
  token: string;
  /** This device's member id. */
  memberId: string;
  /** The team version the local squad and match are based on. */
  version: number;
}

/** Local changes not yet saved to the shared team. They survive restarts, so offline edits aren't lost. */
export interface SyncState {
  dirtyPlayerIds: string[];
  deletedPlayerIds: string[];
  dirtyMatchKeys: (keyof MatchState)[];
}

export const emptySync: SyncState = { dirtyPlayerIds: [], deletedPlayerIds: [], dirtyMatchKeys: [] };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function teamLink(v: unknown): TeamLink | null {
  if (typeof v !== 'object' || v === null) return null;
  const t = v as Record<string, unknown>;
  const text = ['id', 'name', 'inviteCode', 'token', 'memberId'] as const;
  if (!text.every((k) => typeof t[k] === 'string' && t[k] !== '')) return null;
  return {
    id: t.id as string,
    name: t.name as string,
    inviteCode: t.inviteCode as string,
    token: t.token as string,
    memberId: t.memberId as string,
    version: typeof t.version === 'number' ? t.version : 0,
  };
}

function syncState(v: unknown): SyncState {
  if (typeof v !== 'object' || v === null) return { ...emptySync };
  const s = v as Record<string, unknown>;
  return {
    dirtyPlayerIds: strings(s.dirtyPlayerIds),
    deletedPlayerIds: strings(s.deletedPlayerIds),
    dirtyMatchKeys: strings(s.dirtyMatchKeys).filter((k): k is keyof MatchState => k in emptyMatch),
  };
}

/**
 * Combines a save from storage with the initial state. Fields added in later versions (match settings,
 * `team`, `sync`) get their defaults, so older saves keep working. The persist `version` stays 1:
 * zustand drops a save with a different version unless there is a migrate function.
 */
export function mergePersisted<T extends { match: MatchState; team: TeamLink | null; sync: SyncState }>(
  saved: unknown,
  current: T,
): T {
  const persisted = (typeof saved === 'object' && saved !== null ? saved : {}) as Partial<T>;
  return {
    ...current,
    ...persisted,
    match: { ...emptyMatch, ...persisted.match },
    team: teamLink(persisted.team),
    sync: syncState(persisted.sync),
  };
}
