import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { demoSquad, emptyMatch, withoutPlayer, type MatchState, type Player, type Rotation } from '../core';
import { emptySync, mergePersisted, type SyncState, type TeamLink } from './persisted';

export type { MatchState, SyncState, TeamLink };

interface Store {
  squad: Player[];
  match: MatchState;
  /** The shared team this device is a member of; null when the squad is only on this device. */
  team: TeamLink | null;
  /** Local changes to the shared team that are not saved to it yet. */
  sync: SyncState;
  upsertPlayer: (player: Player) => void;
  removePlayer: (id: string) => void;
  /** Fills an empty squad with 15 demo players, all available. Does nothing if the squad has players. */
  loadDemoSquad: () => void;
  /** Removes every demo player (and them from the match); players added by the coach stay. */
  removeDemoSquad: () => void;
  toggleAvailable: (id: string) => void;
  setAllAvailable: (available: boolean) => void;
  addGuest: (guest: Player, saveToSquad: boolean) => void;
  removeGuest: (id: string) => void;
  setFormation: (id: string) => void;
  toggleGoalkeeper: (id: string) => void;
  pin: (slotId: string, playerId: string | undefined) => void;
  clearPins: () => void;
  recalculate: () => void;
  setStrictSwaps: (strict: boolean) => void;
  setRotation: (rotation: Rotation) => void;
  /** After creating or joining a team: use the team's squad and match from now on. */
  connectTeam: (team: TeamLink, squad: Player[], match: MatchState) => void;
  /** Stop sharing on this device. The squad and match stay here as a local copy. */
  disconnectTeam: () => void;
  /** Changes to the membership itself, e.g. a new invite code. */
  updateTeam: (fields: Partial<TeamLink>) => void;
}

export const newId = () => Math.random().toString(36).slice(2, 10);

export const useStore = create<Store>()(
  persist(
    (set) => ({
      squad: [],
      match: emptyMatch,
      team: null,
      sync: emptySync,
      upsertPlayer: (player) =>
        set((s) => ({
          squad: s.squad.some((p) => p.id === player.id)
            ? s.squad.map((p) => (p.id === player.id ? player : p))
            : [...s.squad, player],
          // new squad members are available by default
          match: s.squad.some((p) => p.id === player.id)
            ? s.match
            : { ...s.match, availableIds: [...s.match.availableIds, player.id] },
        })),
      removePlayer: (id) =>
        set((s) => ({
          squad: s.squad.filter((p) => p.id !== id),
          match: withoutPlayer(s.match, id),
        })),
      loadDemoSquad: () =>
        set((s) => {
          if (s.squad.length > 0) return {};
          const squad = demoSquad(newId);
          return {
            squad,
            // keep the match settings (formation, rotation, guests); start from a clean lineup
            match: { ...s.match, availableIds: squad.map((p) => p.id), goalkeeperIds: [], pinned: {}, seed: 0 },
          };
        }),
      removeDemoSquad: () =>
        set((s) => ({
          squad: s.squad.filter((p) => !p.isDemo),
          match: s.squad.filter((p) => p.isDemo).reduce((match, p) => withoutPlayer(match, p.id), s.match),
        })),
      toggleAvailable: (id) =>
        set((s) => {
          const on = s.match.availableIds.includes(id);
          const next = withoutPlayer(s.match, id);
          return {
            match: on ? next : { ...next, availableIds: [...s.match.availableIds, id] },
          };
        }),
      setAllAvailable: (available) =>
        set((s) => ({
          match: { ...s.match, availableIds: available ? s.squad.map((p) => p.id) : [], pinned: {}, goalkeeperIds: [] },
        })),
      addGuest: (guest, saveToSquad) =>
        set((s) =>
          saveToSquad
            ? {
                squad: [...s.squad, guest],
                match: { ...s.match, availableIds: [...s.match.availableIds, guest.id] },
              }
            : { match: { ...s.match, guests: [...s.match.guests, guest] } },
        ),
      removeGuest: (id) => set((s) => ({ match: withoutPlayer(s.match, id) })),
      setFormation: (formationId) => set((s) => ({ match: { ...s.match, formationId, pinned: {} } })),
      toggleGoalkeeper: (id) =>
        set((s) => {
          const has = s.match.goalkeeperIds.includes(id);
          const goalkeeperIds = has
            ? s.match.goalkeeperIds.filter((g) => g !== id)
            : [...s.match.goalkeeperIds, id].slice(-2);
          return { match: { ...s.match, goalkeeperIds, pinned: {} } };
        }),
      pin: (slotId, playerId) =>
        set((s) => {
          const pinned = { ...s.match.pinned };
          if (playerId === undefined) delete pinned[slotId];
          else {
            for (const [slot, id] of Object.entries(pinned)) if (id === playerId) delete pinned[slot];
            pinned[slotId] = playerId;
          }
          return { match: { ...s.match, pinned } };
        }),
      clearPins: () => set((s) => ({ match: { ...s.match, pinned: {}, seed: 0 } })),
      recalculate: () => set((s) => ({ match: { ...s.match, seed: (s.match.seed ?? 0) + 1 } })),
      setStrictSwaps: (strictSwaps) => set((s) => ({ match: { ...s.match, strictSwaps, seed: 0 } })),
      setRotation: (rotation) => set((s) => ({ match: { ...s.match, rotation, seed: 0 } })),
      connectTeam: (team, squad, match) => set({ team, squad, match: { ...emptyMatch, ...match }, sync: emptySync }),
      disconnectTeam: () => set({ team: null, sync: emptySync }),
      updateTeam: (fields) => set((s) => (s.team ? { team: { ...s.team, ...fields } } : {})),
    }),
    {
      name: 'lineup-planner',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // older saves lack newer fields; keep `version` at 1 (see mergePersisted)
      merge: mergePersisted,
    },
  ),
);

/** Everyone available for the match: available squad members followed by guests. */
export function availablePlayers(squad: Player[], match: MatchState): Player[] {
  return [...squad.filter((p) => match.availableIds.includes(p.id)), ...match.guests];
}
