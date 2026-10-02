import { DEFAULT_MATCH_MINUTES } from './windows';

export interface GoalkeeperStint {
  playerId: string;
  from: number;
  to: number;
}

/** One keeper plays the whole match; with two, they play a half each. */
export function planGoalkeepers(
  goalkeeperIds: string[],
  matchMinutes = DEFAULT_MATCH_MINUTES,
): GoalkeeperStint[] {
  if (goalkeeperIds.length === 1) {
    return [{ playerId: goalkeeperIds[0], from: 0, to: matchMinutes }];
  }
  if (goalkeeperIds.length === 2) {
    const half = Math.floor(matchMinutes / 2);
    return [
      { playerId: goalkeeperIds[0], from: 0, to: half },
      { playerId: goalkeeperIds[1], from: half, to: matchMinutes },
    ];
  }
  throw new Error(`Expected 1 or 2 goalkeepers, got ${goalkeeperIds.length}`);
}
