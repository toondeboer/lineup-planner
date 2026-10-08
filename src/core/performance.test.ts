import { describe, expect, it } from 'vitest';
import { getFormation } from './formations';
import { generatePlan, type PlanInput, type Rotation } from './generate';
import { ROLES, type Player, type Rating } from './types';

/**
 * Guards against large slowdowns of the planner, which runs on the phone while the coach waits.
 * On a laptop the default line rotation stays under 100 ms here; the 'equal' rotation is much slower
 * (pinned starters with 12 outfield players take about a second), and a phone (Hermes, no JIT) is
 * slower still. The budget leaves room for slow CI machines but catches a
 * large regression; tighten it as the planner gets faster.
 */
const BUDGET_MS = 3000;

/** Random ratings for every outfield position: the hardest case for the search. */
function randomSquad(outfield: number, seed: number): Player[] {
  let a = seed;
  const rand = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return [
    { id: 'gk', name: 'gk', ratings: { GK: 3 } },
    ...Array.from({ length: outfield }, (_, i) => {
      const ratings: Player['ratings'] = {};
      for (const r of ROLES) if (r !== 'GK') ratings[r] = Math.floor(rand() * 4) as Rating;
      return { id: `p${i}`, name: `p${i}`, ratings };
    }),
  ];
}

function time(input: PlanInput): number {
  const start = performance.now();
  generatePlan(input);
  return performance.now() - start;
}

describe.each<Rotation>(['lines', 'equal'])('planner speed, %s rotation', { timeout: 60_000 }, (rotation) => {
  const formation = getFormation('433');

  for (const outfield of [11, 12, 13, 14, 16, 20]) {
    it(`plans ${outfield} outfield players within budget`, () => {
      const players = randomSquad(outfield, outfield);
      expect(time({ formation, players, rotation })).toBeLessThan(BUDGET_MS);
      expect(time({ formation, players, rotation, strictSwaps: true })).toBeLessThan(BUDGET_MS);
    });
  }

  it('plans around pinned starters within budget', () => {
    const players = randomSquad(12, 7);
    const pinned = { ST: 'p0', CB1: 'p1', CM2: 'p2' };
    expect(time({ formation, players, rotation, pinned })).toBeLessThan(BUDGET_MS);
  });

  it('recalculates within budget', () => {
    const players = randomSquad(12, 12);
    expect(time({ formation, players, rotation, seed: 3 })).toBeLessThan(BUDGET_MS);
  });
});
