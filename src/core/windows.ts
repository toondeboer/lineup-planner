export const DEFAULT_MATCH_MINUTES = 90;

/**
 * Substitution minutes for a rotation group of `groupSize` players.
 * The match is cut into `groupSize` equal parts and the bench player changes at each cut,
 * so every member sits out exactly one part. Minutes are rounded down (a group of 4 in a
 * 90-minute match swaps at 22, 45 and 67).
 */
export function groupWindows(groupSize: number, matchMinutes = DEFAULT_MATCH_MINUTES): number[] {
  if (!Number.isInteger(groupSize) || groupSize < 2) {
    throw new Error(`A rotation group needs at least 2 players, got ${groupSize}`);
  }
  return Array.from({ length: groupSize - 1 }, (_, i) => Math.floor(((i + 1) * matchMinutes) / groupSize));
}

/** Boundaries of the group's segments: [0, ...windows, matchMinutes]. */
export function segmentBounds(groupSize: number, matchMinutes = DEFAULT_MATCH_MINUTES): number[] {
  return [0, ...groupWindows(groupSize, matchMinutes), matchMinutes];
}

/** Minutes each member of the group spends on the pitch, given who sits out which segment. */
export function minutesPerSegmentSitOut(groupSize: number, matchMinutes = DEFAULT_MATCH_MINUTES): number[] {
  const bounds = segmentBounds(groupSize, matchMinutes);
  return bounds.slice(1).map((end, i) => matchMinutes - (end - bounds[i]));
}
