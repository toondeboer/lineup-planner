import type { Rotation } from './generate';
import type { Player } from './types';

/** The setup of the upcoming match. Shared between the app and the team server. */
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
  /** Bumped by "Recalculate" to get a different but equally good plan; 0 means the default plan. */
  seed: number;
  /** Only like-for-like swaps: nobody changes position at a substitution. */
  strictSwaps: boolean;
  /** Rotation groups per line (defence, midfield, attack), or the most equal playing time. */
  rotation: Rotation;
}

export const emptyMatch: MatchState = {
  availableIds: [],
  guests: [],
  formationId: '433',
  goalkeeperIds: [],
  pinned: {},
  seed: 0,
  strictSwaps: false,
  rotation: 'lines',
};

/** Removes a player from the match (availability, guests, keeper choice and pins). */
export function withoutPlayer(match: MatchState, id: string): MatchState {
  return {
    ...match,
    availableIds: match.availableIds.filter((p) => p !== id),
    guests: match.guests.filter((p) => p.id !== id),
    goalkeeperIds: match.goalkeeperIds.filter((p) => p !== id),
    pinned: Object.fromEntries(Object.entries(match.pinned).filter(([, p]) => p !== id)),
  };
}
