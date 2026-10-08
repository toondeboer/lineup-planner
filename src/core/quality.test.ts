import { describe, expect, it } from 'vitest';
import { getFormation } from './formations';
import { generatePlan } from './generate';
import { lineupAt } from './plan';
import { ROLES, type Player, type Rating, type Role } from './types';

const formation = getFormation('433');

function allRounders(outfield: number, rating: Rating = 3): Player[] {
  const ratings: Partial<Record<Role, Rating>> = {};
  for (const r of ROLES) if (r !== 'GK') ratings[r] = rating;
  return [
    { id: 'gk', name: 'gk', ratings: { GK: 3 } },
    ...Array.from({ length: outfield }, (_, i) => ({ id: `p${i}`, name: `p${i}`, ratings: { ...ratings } })),
  ];
}

function specialists(outfield: number, seed: number, secondary = 0.35): Player[] {
  let a = seed;
  const rand = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const base: Role[] = ['LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW'];
  const more: Role[] = ['CB', 'CM', 'LB', 'RB', 'ST', 'LW', 'RW', 'CM', 'CB', 'DM'];
  const roles = [...base, ...more.sort(() => rand() - 0.5).slice(0, outfield - 10)];
  return [
    { id: 'gk', name: 'gk', ratings: { GK: 3 } },
    ...roles.map((role, i) => {
      const ratings: Partial<Record<Role, Rating>> = { [role]: 3 };
      for (const r of ROLES) if (r !== 'GK' && r !== role && rand() < secondary) ratings[r] = 2;
      return { id: `p${i}`, name: `p${i}`, ratings };
    }),
  ];
}

describe('position fit', () => {
  it('accounts for every player-minute in the fit summary', () => {
    const plan = generatePlan({ formation, players: specialists(14, 3) });
    const total = plan.fit.preferred + plan.fit.ok + plan.fit.emergency + plan.fit.unsuited;
    expect(total).toBe(11 * plan.matchMinutes);
  });

  it('plays everyone in a preferred position when everyone can play anywhere', () => {
    const plan = generatePlan({ formation, players: allRounders(14) });
    expect(plan.fit).toEqual({ preferred: 990, ok: 0, emergency: 0, unsuited: 0 });
    expect(plan.warnings).toEqual([]);
  });

  it('prefers "OK" positions over emergency or unsuited ones', () => {
    // half the squad can only cover the other positions at "OK" level, nobody is rated 0 or 1
    const players = allRounders(14, 2);
    const plan = generatePlan({ formation, players });
    expect(plan.fit.unsuited + plan.fit.emergency).toBe(0);
  });

  it('lets teammates shift position, which never costs more than strict like-for-like swaps', () => {
    let strictBad = 0;
    let flexibleBad = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const players = specialists(14, seed * 17);
      const strict = generatePlan({ formation, players, strictSwaps: true });
      const flexible = generatePlan({ formation, players });
      strictBad += strict.fit.unsuited;
      flexibleBad += flexible.fit.unsuited;
    }
    expect(flexibleBad).toBeLessThanOrEqual(strictBad);
  });

  it('strict mode only makes like-for-like swaps', () => {
    const plan = generatePlan({ formation, players: specialists(15, 5), strictSwaps: true });
    for (const sub of plan.substitutions) {
      expect(sub.moves).toEqual([]);
      expect(sub.onSlotId).toBe(sub.slotId);
    }
  });

  it('reports position changes so the lineup stays consistent at every minute', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const plan = generatePlan({ formation, players: specialists(16, seed * 5) });
      for (let minute = 0; minute < 90; minute++) {
        const lineup = lineupAt(plan, minute);
        expect(Object.keys(lineup)).toHaveLength(11);
        expect(new Set(Object.values(lineup)).size).toBe(11);
      }
    }
  });
});

describe('priorities', () => {
  it('does not move anybody when like-for-like swaps are just as good', () => {
    const plan = generatePlan({ formation, players: allRounders(15) });
    for (const sub of plan.substitutions) expect(sub.moves).toEqual([]);
  });

  it('shifts teammates only to avoid positions rated "no" or "emergency"', () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const players = specialists(14, seed * 13, 0.08);
      const strict = generatePlan({ formation, players, strictSwaps: true });
      const flexible = generatePlan({ formation, players });
      // never worse, and every plan that moves somebody is better where it counts
      expect(flexible.fit.unsuited).toBeLessThanOrEqual(strict.fit.unsuited);
      const moved = flexible.substitutions.some((s) => s.moves.length > 0);
      if (moved) {
        expect(
          flexible.fit.unsuited < strict.fit.unsuited || flexible.fit.unsuited + flexible.fit.emergency < strict.fit.unsuited + strict.fit.emergency,
        ).toBe(true);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('keeps playing time equal even if ratings would be better with an uneven split', () => {
    const plan = generatePlan({ formation, players: specialists(14, 2), rotation: 'equal' });
    const minutes = Object.entries(plan.minutes).filter(([id]) => id !== 'gk').map(([, m]) => m);
    expect(Math.max(...minutes) - Math.min(...minutes)).toBeLessThanOrEqual(8); // 67 vs 60 minutes (3/4 vs 2/3)
  });
});

describe('recalculate with a seed', () => {
  const players = allRounders(14);
  const key = (plan: ReturnType<typeof generatePlan>) => JSON.stringify([plan.starting, plan.substitutions]);

  it('gives the same plan for the same seed', () => {
    expect(key(generatePlan({ formation, players, seed: 3 }))).toBe(key(generatePlan({ formation, players, seed: 3 })));
  });

  it('gives different plans of the same quality for different seeds', () => {
    const plans = [1, 2, 3, 4, 5].map((seed) => generatePlan({ formation, players, seed }));
    expect(new Set(plans.map(key)).size).toBeGreaterThan(1);
    for (const plan of plans) expect(plan.fit).toEqual({ preferred: 990, ok: 0, emergency: 0, unsuited: 0 });
  });

  it('never trades quality for variety', () => {
    const squad = specialists(14, 9);
    const base = generatePlan({ formation, players: squad });
    for (const seed of [1, 2, 3]) {
      const plan = generatePlan({ formation, players: squad, seed });
      expect(plan.fit.unsuited).toBeLessThanOrEqual(base.fit.unsuited);
      expect(plan.fit.unsuited + plan.fit.emergency).toBeLessThanOrEqual(base.fit.unsuited + base.fit.emergency);
    }
  });

  it('keeps pinned starters when recalculating', () => {
    const plan = generatePlan({ formation, players, seed: 4, pinned: { ST: 'p2', LB: 'p7' } });
    expect(plan.starting['ST']).toBe('p2');
    expect(plan.starting['LB']).toBe('p7');
  });
});
