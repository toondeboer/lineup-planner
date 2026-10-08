import type { Rotation } from './generate';
import { planGroupSizes, OUTFIELD_SLOTS } from './groups';
import { LINES, lineSizings } from './lines';
import type { Formation } from './types';
import { DEFAULT_MATCH_MINUTES, groupWindows } from './windows';

const SHARES: Record<number, string> = { 2: '½', 3: '⅔', 4: '¾', 5: '⅘', 6: '⅚' };

export function shareLabel(groupSize: number): string {
  if (groupSize === 1) return 'whole match';
  return SHARES[groupSize] ?? `${groupSize - 1}/${groupSize}`;
}

const LINE_NAMES = { defence: 'Defence', midfield: 'Midfield', attack: 'Attack' } as const;

/**
 * Human-readable description of how a squad of `players` (goalkeeper included) will rotate.
 * With a formation and line rotation it describes the groups per line; otherwise the most equal split.
 */
export function describeRotation(
  players: number,
  keepers = 1,
  { formation, rotation = 'lines' }: { formation?: Formation; rotation?: Rotation } = {},
): string {
  const outfield = players - keepers;
  if (outfield < OUTFIELD_SLOTS) return `Need at least ${OUTFIELD_SLOTS + keepers} players (have ${players}).`;
  if (outfield > 2 * OUTFIELD_SLOTS) return `Too many players: at most ${2 * OUTFIELD_SLOTS + keepers} can rotate.`;
  if (formation && rotation === 'lines') return describeLines(formation, outfield);
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

function describeLines(formation: Formation, outfield: number): string {
  const { groups } = lineSizings(formation.slots, outfield)[0];
  if (groups.every((g) => g.size === 1)) return 'No substitutes: everyone plays the whole match.';
  const parts = LINES.flatMap((line) => {
    const inLine = groups.filter((g) => g.line === line);
    if (inLine.length === 0) return [];
    const rotating = inLine.filter((g) => g.size > 1).map((g) => `${g.size} players (${shareLabel(g.size)})`);
    const fullTime = inLine.length - rotating.length;
    const desc = [...rotating, ...(fullTime > 0 ? [`${fullTime} full match`] : [])];
    return [`${LINE_NAMES[line]}: ${desc.join(' + ')}`];
  });
  const minutes = [...new Set(groups.filter((g) => g.size > 1).flatMap((g) => groupWindows(g.size, DEFAULT_MATCH_MINUTES)))];
  minutes.sort((a, b) => a - b);
  return `${parts.join(' · ')}. Substitutions at ${minutes.map((m) => `${m}'`).join(', ')}.`;
}
