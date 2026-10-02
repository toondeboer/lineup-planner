import { planGroupSizes, OUTFIELD_SLOTS } from './groups';

const SHARES: Record<number, string> = { 2: '½', 3: '⅔', 4: '¾', 5: '⅘', 6: '⅚' };

export function shareLabel(groupSize: number): string {
  if (groupSize === 1) return 'whole match';
  return SHARES[groupSize] ?? `${groupSize - 1}/${groupSize}`;
}

/** Human-readable description of how a squad of `players` (goalkeeper included) will rotate. */
export function describeRotation(players: number, keepers = 1): string {
  const outfield = players - keepers;
  if (outfield < OUTFIELD_SLOTS) return `Need at least ${OUTFIELD_SLOTS + keepers} players (have ${players}).`;
  if (outfield > 2 * OUTFIELD_SLOTS) return `Too many players: at most ${2 * OUTFIELD_SLOTS + keepers} can rotate.`;
  const { groupSizes, fullTime } = planGroupSizes(outfield);
  if (groupSizes.length === 0) return 'No substitutes: everyone plays the whole match.';
  const parts: string[] = [];
  for (const size of [...new Set(groupSizes)]) {
    const count = groupSizes.filter((g) => g === size).length;
    parts.push(`${count} × ${size} (${shareLabel(size)})`);
  }
  if (fullTime > 0) parts.push(`${fullTime} full match`);
  const n = groupSizes.length;
  return `${n} rotation group${n === 1 ? '' : 's'}: ${parts.join(', ')}.`;
}
