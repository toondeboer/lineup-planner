import { compareKeys, DEFAULT_MAX_GROUP_SIZE, fairnessCost, OUTFIELD_SLOTS, type GroupSizing, type GroupSizingOptions } from './groups';
import type { Role, Slot } from './types';
import { groupWindows } from './windows';

export type Line = 'defence' | 'midfield' | 'attack';

export const LINES: Line[] = ['defence', 'midfield', 'attack'];

const LINE_OF: Record<Exclude<Role, 'GK'>, Line> = {
  LB: 'defence',
  CB: 'defence',
  RB: 'defence',
  DM: 'midfield',
  CM: 'midfield',
  AM: 'midfield',
  LM: 'midfield',
  RM: 'midfield',
  LW: 'attack',
  RW: 'attack',
  ST: 'attack',
};

export function lineOf(role: Role): Line | undefined {
  return role === 'GK' ? undefined : LINE_OF[role];
}

/** A rotation group (or a full-time player, size 1) that stays within one line. */
export interface LineGroup {
  line: Line;
  size: number;
}

export interface LineSizing extends GroupSizing {
  /** Rotation groups first, then full-time players; each tied to a line. */
  groups: LineGroup[];
  /** Sort key (lower is better); splits with an equal key are equally good. */
  rank: number[];
}

/**
 * Most a player may play longer than a teammate (as a share of the match) for the plan to still
 * prefer fewer substitution moments over more equal time. One quarter allows e.g. one full-time
 * player next to groups of 4.
 */
const CLOSE_ENOUGH_SPREAD = 0.25;

/**
 * Every way to split the squad into rotation groups that each stay within one line (defence,
 * midfield or attack), best first.
 *
 * Each line can hold several groups; slots in a line that no group covers go to full-time players.
 * Among splits where nobody plays more than a quarter of the match longer than a teammate, the one
 * with the fewest substitution moments comes first (ideally every group swaps at the same moments,
 * e.g. each quarter with groups of 4). After that the fairest split wins, as in `candidateSizings`.
 */
export function lineSizings(slots: Slot[], outfieldPlayers: number, options: GroupSizingOptions = {}): LineSizing[] {
  const maxGroupSize = options.maxGroupSize ?? DEFAULT_MAX_GROUP_SIZE;
  if (!Number.isInteger(outfieldPlayers) || outfieldPlayers < OUTFIELD_SLOTS) {
    throw new Error(`Need at least ${OUTFIELD_SLOTS} outfield players, got ${outfieldPlayers}`);
  }
  const groupCount = outfieldPlayers - OUTFIELD_SLOTS;
  const slotsPerLine = LINES.map((line) => slots.filter((s) => lineOf(s.role) === line).length);

  // Per line: every non-increasing list of on-pitch counts that fits in the line.
  const perLine = slotsPerLine.map((size) => {
    const out: number[][] = [];
    const visit = (parts: number[], remaining: number, max: number) => {
      out.push(parts);
      for (let p = Math.min(max, remaining); p >= 1; p--) visit([...parts, p], remaining - p, p);
    };
    visit([], size, maxGroupSize - 1);
    return out;
  });

  const found: { sizing: LineSizing; key: number[] }[] = [];
  const combine = (lineIndex: number, chosen: number[][]) => {
    const used = chosen.reduce((a, parts) => a + parts.length, 0);
    if (lineIndex === LINES.length) {
      if (used === groupCount) found.push(rank(chosen, slotsPerLine));
      return;
    }
    for (const parts of perLine[lineIndex]) {
      if (used + parts.length <= groupCount) combine(lineIndex + 1, [...chosen, parts]);
    }
  };
  combine(0, []);

  if (found.length === 0) throw new Error(`No valid grouping for ${outfieldPlayers} outfield players`);
  found.sort((a, b) => compareKeys(a.key, b.key));
  return found.map((f) => f.sizing);
}

function rank(partsPerLine: number[][], slotsPerLine: number[]): { sizing: LineSizing; key: number[] } {
  const rotating: LineGroup[] = [];
  const fullTimers: LineGroup[] = [];
  partsPerLine.forEach((parts, i) => {
    for (const p of parts) rotating.push({ line: LINES[i], size: p + 1 });
    const covered = parts.reduce((a, b) => a + b, 0);
    for (let k = covered; k < slotsPerLine[i]; k++) fullTimers.push({ line: LINES[i], size: 1 });
  });
  rotating.sort((a, b) => b.size - a.size);
  const groupSizes = rotating.map((g) => g.size);
  const shares = groupSizes.map((g) => (g - 1) / g);
  if (fullTimers.length > 0) shares.push(1);
  const spread = shares.length ? Math.max(...shares) - Math.min(...shares) : 0;
  const moments = new Set(groupSizes.flatMap((g) => groupWindows(g))).size;
  const closeEnough = spread <= CLOSE_ENOUGH_SPREAD + 1e-9;
  const base = { groupSizes, fullTime: fullTimers.length, spread };
  const key = [
    closeEnough ? 0 : 1,
    closeEnough ? moments : 0,
    Math.round(fairnessCost(base, 90) * 1e3),
    base.fullTime,
    moments,
    Math.max(0, ...groupSizes),
  ];
  return { sizing: { ...base, groups: [...rotating, ...fullTimers], rank: key }, key };
}
