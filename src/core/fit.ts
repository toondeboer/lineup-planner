import type { Player, Role } from './types';

/** Cost per minute of playing a role at the given rating (3 = preferred ... 0 = unsuitable). */
const PENALTY = [1000, 100, 8, 0] as const;

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
