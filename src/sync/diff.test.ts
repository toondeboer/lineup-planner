import { describe, expect, it } from 'vitest';
import { emptyMatch, type Player, type TeamView } from '../core';
import { emptySync } from '../state/persisted';
import { applyRemote, diffState, hasChanges, markDirty } from './diff';

const noah: Player = { id: 'p1', name: 'Noah', ratings: { CB: 3 } };
const sam: Player = { id: 'p2', name: 'Sam', ratings: { GK: 3 } };
const bram: Player = { id: 'p3', name: 'Bram', ratings: { ST: 3 } };

describe('diffState', () => {
  it('finds added, changed and removed players and changed match fields', () => {
    const prev = { squad: [noah, sam], match: emptyMatch };
    const next = {
      squad: [{ ...noah, ratings: { CB: 2 as const } }, bram],
      match: { ...emptyMatch, formationId: '442', availableIds: ['p1'] },
    };
    expect(diffState(prev, next)).toEqual({
      upsertPlayerIds: ['p1', 'p3'],
      deletedPlayerIds: ['p2'],
      matchKeys: ['availableIds', 'formationId'],
    });
  });

  it('ignores copies that are equal', () => {
    const c = diffState({ squad: [noah], match: emptyMatch }, { squad: [{ ...noah }], match: { ...emptyMatch } });
    expect(hasChanges(c)).toBe(false);
  });
});

describe('markDirty', () => {
  it('collects changes until they are saved', () => {
    const once = markDirty(emptySync, { upsertPlayerIds: ['p1'], deletedPlayerIds: [], matchKeys: ['seed'] });
    const twice = markDirty(once, { upsertPlayerIds: ['p1', 'p3'], deletedPlayerIds: [], matchKeys: ['pinned'] });
    expect(twice).toEqual({ dirtyPlayerIds: ['p1', 'p3'], deletedPlayerIds: [], dirtyMatchKeys: ['seed', 'pinned'] });
  });

  it('lets a delete cancel an upsert, and a re-add cancel a delete', () => {
    const added = markDirty(emptySync, { upsertPlayerIds: ['p1'], deletedPlayerIds: [], matchKeys: [] });
    const deleted = markDirty(added, { upsertPlayerIds: [], deletedPlayerIds: ['p1'], matchKeys: [] });
    expect(deleted).toMatchObject({ dirtyPlayerIds: [], deletedPlayerIds: ['p1'] });
    const back = markDirty(deleted, { upsertPlayerIds: ['p1'], deletedPlayerIds: [], matchKeys: [] });
    expect(back).toMatchObject({ dirtyPlayerIds: ['p1'], deletedPlayerIds: [] });
  });
});

describe('applyRemote', () => {
  const remote = (players: Player[], match = emptyMatch): TeamView => ({
    id: 't1',
    name: 'JO17-1',
    inviteCode: 'c',
    version: 5,
    you: 'm1',
    members: [],
    players,
    match,
  });

  it("takes the team's squad and match when nothing is unsaved", () => {
    const local = { squad: [noah], match: emptyMatch, sync: emptySync };
    expect(applyRemote(local, remote([sam, bram], { ...emptyMatch, formationId: '442' }))).toEqual({
      squad: [sam, bram],
      match: { ...emptyMatch, formationId: '442' },
    });
  });

  it('keeps unsaved local changes on top of the team', () => {
    const renamed = { ...noah, name: 'Noah B' };
    const newcomer: Player = { id: 'p9', name: 'Luuk', ratings: {} };
    const local = {
      squad: [renamed, newcomer],
      match: { ...emptyMatch, formationId: '352', seed: 3 },
      sync: { dirtyPlayerIds: ['p1', 'p9'], deletedPlayerIds: ['p2'], dirtyMatchKeys: ['formationId' as const] },
    };
    const result = applyRemote(local, remote([noah, sam, bram], { ...emptyMatch, formationId: '442', seed: 7 }));
    expect(result.squad).toEqual([renamed, bram, newcomer]);
    expect(result.match).toMatchObject({ formationId: '352', seed: 7 });
  });
});
