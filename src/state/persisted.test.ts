import { describe, expect, it } from 'vitest';
import { emptyMatch } from '../core';
import { emptySync, mergePersisted, type TeamLink } from './persisted';

const initial = { squad: [], match: emptyMatch, team: null as TeamLink | null, sync: emptySync };
const link: TeamLink = { id: 't1', name: 'JO17-1', inviteCode: 'c'.repeat(32), token: 'secret', memberId: 'm1', version: 4 };

describe('mergePersisted', () => {
  it('loads a save from before shared teams: same squad and match, not in a team', () => {
    const squad = [{ id: 'p1', name: 'Noah', ratings: { CB: 3 as const } }];
    const saved = { squad, match: { ...emptyMatch, availableIds: ['p1'], formationId: '442' } };
    const state = mergePersisted(saved, initial);
    expect(state.squad).toEqual(squad);
    expect(state.match).toMatchObject({ availableIds: ['p1'], formationId: '442' });
    expect(state.team).toBeNull();
    expect(state.sync).toEqual(emptySync);
  });

  it('fills match settings that older saves lack', () => {
    const state = mergePersisted({ squad: [], match: { availableIds: [], guests: [], formationId: '433', goalkeeperIds: [], pinned: {} } }, initial);
    expect(state.match).toMatchObject({ seed: 0, strictSwaps: false, rotation: 'lines' });
  });

  it('keeps a team membership and unsaved changes', () => {
    const sync = { dirtyPlayerIds: ['p1'], deletedPlayerIds: ['p2'], dirtyMatchKeys: ['formationId' as const] };
    const state = mergePersisted({ squad: [], match: emptyMatch, team: link, sync }, initial);
    expect(state.team).toEqual(link);
    expect(state.sync).toEqual(sync);
  });

  it('drops a damaged membership or sync state instead of crashing', () => {
    const state = mergePersisted(
      { team: { id: 't1', token: '' }, sync: { dirtyPlayerIds: 'p1', dirtyMatchKeys: ['formationId', 'nope', 3] } },
      initial,
    );
    expect(state.team).toBeNull();
    expect(state.sync).toEqual({ dirtyPlayerIds: [], deletedPlayerIds: [], dirtyMatchKeys: ['formationId'] });
  });

  it('starts fresh when there is no save', () => {
    expect(mergePersisted(undefined, initial)).toEqual(initial);
    expect(mergePersisted(null, initial)).toEqual(initial);
  });
});
