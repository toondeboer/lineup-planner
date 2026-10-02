/** Outfield places on the pitch: 11 players minus the goalkeeper. */
export const OUTFIELD_SLOTS = 10;

export const DEFAULT_MAX_GROUP_SIZE = 6;

export interface GroupSizing {
  /**
   * Rotation group sizes, largest first. A group of size g has g - 1 players
   * on the pitch and 1 on the bench at any time, so each member plays (g - 1) / g.
   */
  groupSizes: number[];
  /** Players who stay on the pitch for the whole match. */
  fullTime: number;
  /** Share of the match each player plays, by group size (full-time players play 1). */
  spread: number;
}

export interface GroupSizingOptions {
  /** Largest allowed group, i.e. the smallest playing share is (g - 1) / g. Defaults to 6. */
  maxGroupSize?: number;
}

/**
 * Splits the outfield squad into rotation groups.
 *
 * With N outfield players there are N - 10 bench places, so there are exactly N - 10 groups
 * (each group always keeps one player on the bench). Each group covers p of the 10 slots and has
 * p + 1 members. Any slots not covered by a group are filled by full-time players.
 *
 * Among all valid splits we pick the fairest one: smallest gap between the most and least
 * playing time, then the fewest full-time players, then the fewest different group sizes,
 * then the smallest groups (which swap most often and are easiest to follow).
 */
export function planGroupSizes(outfieldPlayers: number, options: GroupSizingOptions = {}): GroupSizing {
  const maxGroupSize = options.maxGroupSize ?? DEFAULT_MAX_GROUP_SIZE;
  if (maxGroupSize < 2) throw new Error('maxGroupSize must be at least 2');
  if (!Number.isInteger(outfieldPlayers) || outfieldPlayers < OUTFIELD_SLOTS) {
    throw new Error(`Need at least ${OUTFIELD_SLOTS} outfield players, got ${outfieldPlayers}`);
  }
  const groupCount = outfieldPlayers - OUTFIELD_SLOTS;
  if (groupCount > OUTFIELD_SLOTS) {
    throw new Error(`At most ${2 * OUTFIELD_SLOTS} outfield players can be rotated, got ${outfieldPlayers}`);
  }

  let best: { sizing: GroupSizing; key: number[] } | undefined;

  // Enumerate non-increasing lists of on-pitch counts p (1..maxGroupSize-1), one per group.
  const visit = (parts: number[], remaining: number, max: number) => {
    if (parts.length === groupCount) {
      const fullTime = remaining;
      const groupSizes = parts.map((p) => p + 1);
      const shares = groupSizes.map((g) => (g - 1) / g);
      if (fullTime > 0) shares.push(1);
      const spread = shares.length ? Math.max(...shares) - Math.min(...shares) : 0;
      const key = [
        Math.round(spread * 1e9),
        fullTime,
        new Set(groupSizes).size,
        Math.max(0, ...groupSizes),
      ];
      if (!best || compare(key, best.key) < 0) {
        best = { sizing: { groupSizes, fullTime, spread }, key };
      }
      return;
    }
    const slotsLeftForGroups = groupCount - parts.length;
    for (let p = Math.min(max, remaining - (slotsLeftForGroups - 1)); p >= 1; p--) {
      visit([...parts, p], remaining - p, p);
    }
  };
  visit([], OUTFIELD_SLOTS, maxGroupSize - 1);

  if (!best) throw new Error(`No valid grouping for ${outfieldPlayers} outfield players`);
  return best.sizing;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
