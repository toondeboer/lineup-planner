import type { Player, Role } from './types';

/**
 * Cost per minute of playing a role at the given rating (3 = preferred ... 0 = unsuitable).
 *
 * The weights make the priorities strict: one minute at "no" outweighs any number of minutes at
 * "emergency", one minute at "emergency" outweighs every position change plus every minute at "OK"
 * (a match has at most 990 player-minutes). `MOVE_PENALTY` in the group solver sits between
 * "emergency" and "OK".
 */
const PENALTY = [1e9, 1e5, 1, 0] as const;

export function rating(player: Player, role: Role): 0 | 1 | 2 | 3 {
  return player.ratings[role] ?? 0;
}

export function penalty(player: Player, role: Role): number {
  return PENALTY[rating(player, role)];
}

/** Euclidean distance in pitch percent, scaled to 0..1 for a full-pitch diagonal. */
export function pitchDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y) / Math.hypot(100, 100);
}
