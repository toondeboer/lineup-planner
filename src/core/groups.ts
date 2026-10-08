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
  return candidateSizings(outfieldPlayers, options)[0];
}

/** How much a player's share of the match may differ from the ideal 10 / N before it costs anything extra. */
const FAIRNESS_PER_MINUTE = 6;

/** Cost of an uneven split of playing time, in the same units as the rating penalties. */
export function fairnessCost(sizing: GroupSizing, matchMinutes: number): number {
  const players = sizing.groupSizes.reduce((a, b) => a + b, 0) + sizing.fullTime;
  const ideal = OUTFIELD_SLOTS / players;
  let deviation = 0;
  for (const g of sizing.groupSizes) deviation += g * Math.abs((g - 1) / g - ideal);
  deviation += sizing.fullTime * Math.abs(1 - ideal);
  return FAIRNESS_PER_MINUTE * matchMinutes * deviation;
}

/**
 * Every valid way to split the squad into rotation groups, fairest first (see `planGroupSizes`
 * for the ordering). The planner can try several of these when a fair split would force someone
 * to play out of position.
 */
export function candidateSizings(outfieldPlayers: number, options: GroupSizingOptions = {}): GroupSizing[] {
  const maxGroupSize = options.maxGroupSize ?? DEFAULT_MAX_GROUP_SIZE;
  if (maxGroupSize < 2) throw new Error('maxGroupSize must be at least 2');
  if (!Number.isInteger(outfieldPlayers) || outfieldPlayers < OUTFIELD_SLOTS) {
    throw new Error(`Need at least ${OUTFIELD_SLOTS} outfield players, got ${outfieldPlayers}`);
  }
  const groupCount = outfieldPlayers - OUTFIELD_SLOTS;
  if (groupCount > OUTFIELD_SLOTS) {
    throw new Error(`At most ${2 * OUTFIELD_SLOTS} outfield players can be rotated, got ${outfieldPlayers}`);
  }

  const found: { sizing: GroupSizing; key: number[] }[] = [];

  // Enumerate non-increasing lists of on-pitch counts p (1..maxGroupSize-1), one per group.
  const visit = (parts: number[], remaining: number, max: number) => {
    if (parts.length === groupCount) {
      const fullTime = remaining;
      const groupSizes = parts.map((p) => p + 1);
      const shares = groupSizes.map((g) => (g - 1) / g);
      if (fullTime > 0) shares.push(1);
      const spread = shares.length ? Math.max(...shares) - Math.min(...shares) : 0;
      const sizing = { groupSizes, fullTime, spread };
      const key = [
        Math.round(fairnessCost(sizing, 90) * 1e3),
        fullTime,
        new Set(groupSizes).size,
        Math.max(0, ...groupSizes),
      ];
      found.push({ sizing, key });
      return;
    }
    const slotsLeftForGroups = groupCount - parts.length;
    for (let p = Math.min(max, remaining - (slotsLeftForGroups - 1)); p >= 1; p--) {
      visit([...parts, p], remaining - p, p);
    }
  };
  visit([], OUTFIELD_SLOTS, maxGroupSize - 1);

  if (found.length === 0) throw new Error(`No valid grouping for ${outfieldPlayers} outfield players`);
  found.sort((a, b) => compareKeys(a.key, b.key));
  return found.map((f) => f.sizing);
}

/** Lexicographic comparison of sort keys. */
export function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
