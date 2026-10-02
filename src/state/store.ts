import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Player } from '../core';

export interface MatchState {
  /** Ids of squad members who are available for this match. */
  availableIds: string[];
  /** Guests for this match only (saved guests live in the squad). */
  guests: Player[];
  formationId: string;
  /** Explicit goalkeepers; empty means choose automatically. */
  goalkeeperIds: string[];
  /** Manual starting-lineup overrides: slot id -> player id. */
  pinned: Record<string, string>;
}

interface Store {
  squad: Player[];
  match: MatchState;
  upsertPlayer: (player: Player) => void;
  removePlayer: (id: string) => void;
  toggleAvailable: (id: string) => void;
  setAllAvailable: (available: boolean) => void;
  addGuest: (guest: Player, saveToSquad: boolean) => void;
  removeGuest: (id: string) => void;
  setFormation: (id: string) => void;
  toggleGoalkeeper: (id: string) => void;
  pin: (slotId: string, playerId: string | undefined) => void;
  clearPins: () => void;
}

const emptyMatch: MatchState = {
  availableIds: [],
  guests: [],
  formationId: '433',
  goalkeeperIds: [],
  pinned: {},
};

export const newId = () => Math.random().toString(36).slice(2, 10);

export const useStore = create<Store>()(
  persist(
    (set) => ({
      squad: [],
      match: emptyMatch,
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
      clearPins: () => set((s) => ({ match: { ...s.match, pinned: {} } })),
    }),
    {
      name: 'lineup-planner',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);

/** Removes a player from the match (availability, guests, keeper choice and pins). */
function withoutPlayer(match: MatchState, id: string): MatchState {
  return {
    ...match,
    availableIds: match.availableIds.filter((p) => p !== id),
    guests: match.guests.filter((p) => p.id !== id),
    goalkeeperIds: match.goalkeeperIds.filter((p) => p !== id),
    pinned: Object.fromEntries(Object.entries(match.pinned).filter(([, p]) => p !== id)),
  };
}

/** Everyone available for the match: available squad members followed by guests. */
export function availablePlayers(squad: Player[], match: MatchState): Player[] {
  return [...squad.filter((p) => match.availableIds.includes(p.id)), ...match.guests];
}
