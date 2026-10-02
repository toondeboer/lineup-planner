import { describe, expect, it } from 'vitest';
import { getFormation } from './formations';
import { generatePlan } from './generate';
import { lineupAt } from './plan';
import { ROLES, type Player, type Rating } from './types';

function squad(outfield: number, seed: number, keepers = 1): Player[] {
  let a = seed;
  const rand = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 2 ** 32;
  };
  const players: Player[] = Array.from({ length: keepers }, (_, i) => ({
    id: `gk${i}`,
    name: `gk${i}`,
    ratings: { GK: 3 as Rating },
  }));
  for (let i = 0; i < outfield; i++) {
    const ratings: Player['ratings'] = {};
    for (const role of ROLES) if (role !== 'GK') ratings[role] = Math.floor(rand() * 4) as Rating;
    players.push({ id: `p${i}`, name: `p${i}`, ratings });
  }
  return players;
}

const formation = getFormation('433');
const outfieldSlotIds = formation.slots.filter((s) => s.role !== 'GK').map((s) => s.id);

describe('pinned starters', () => {
  it.each([10, 12, 13, 14, 15, 16, 18, 20])('a fully pinned starting 11 with %i outfield players', (n) => {
    const players = squad(n, n);
    const pinned: Record<string, string> = { GK: 'gk0' };
    // deliberately the worst choice: the last players in the squad start
    outfieldSlotIds.forEach((slot, i) => (pinned[slot] = `p${n - 1 - i}`));
    const plan = generatePlan({ formation, players, pinned });

    expect(plan.starting).toEqual(pinned);
    expect(new Set(plan.startingBench)).toEqual(new Set(players.map((p) => p.id).filter((id) => !Object.values(pinned).includes(id))));
    for (let minute = 0; minute < 90; minute++) {
      expect(new Set(Object.values(lineupAt(plan, minute))).size).toBe(11);
    }
    expect(Object.values(plan.minutes).reduce((a, b) => a + b, 0)).toBe(990);
    // every substitute plays, and gets roughly the same share as their group mates
    for (const group of plan.groups) {
      const times = group.memberIds.map((id) => plan.minutes[id]);
      expect(Math.max(...times) - Math.min(...times)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps a partial pin and still rotates everybody', () => {
    const players = squad(14, 4);
    const plan = generatePlan({ formation, players, pinned: { ST: 'p5', CB1: 'p9' } });
    expect(plan.starting['ST']).toBe('p5');
    expect(plan.starting['CB1']).toBe('p9');
    expect(plan.startingBench).toHaveLength(4);
    expect(Object.values(plan.minutes).every((m) => m > 0)).toBe(true);
  });

  it('recalculates substitutions when the starting 11 changes', () => {
    const players = squad(14, 21);
    const auto = generatePlan({ formation, players });
    const benched = auto.startingBench[0];
    const slot = Object.keys(auto.starting).find((s) => s !== 'GK')!;
    const forced = generatePlan({ formation, players, pinned: { [slot]: benched } });
    expect(forced.starting[slot]).toBe(benched);
    expect(forced.substitutions).not.toEqual(auto.substitutions);
    expect(forced.startingBench).toHaveLength(4);
    expect(forced.startingBench).not.toContain(benched);
  });

  it('lets the pinned goalkeeper start when there are two keepers', () => {
    const players = squad(13, 2, 2);
    const plan = generatePlan({ formation, players, pinned: { GK: 'gk1' } });
    expect(plan.starting['GK']).toBe('gk1');
    expect(lineupAt(plan, 50)['GK']).toBe('gk0');
    expect(plan.startingBench).toContain('gk0');
  });

  it('starts an outfield-pinned keeper in the field', () => {
    const players = squad(13, 2, 2);
    const plan = generatePlan({ formation, players, pinned: { ST: 'gk0' } });
    expect(plan.starting['ST']).toBe('gk0');
    expect(plan.starting['GK']).toBe('gk1');
    expect(plan.goalkeepers).toHaveLength(1);
  });

  it('is deterministic', () => {
    const players = squad(15, 8);
    const pinned = { LB: 'p1', ST: 'p2' };
    expect(generatePlan({ formation, players, pinned })).toEqual(generatePlan({ formation, players, pinned }));
  });

  it('rejects invalid pins', () => {
    const players = squad(14, 1);
    expect(() => generatePlan({ formation, players, pinned: { XX: 'p1' } })).toThrow(/slot/);
    expect(() => generatePlan({ formation, players, pinned: { ST: 'nobody' } })).toThrow(/player/);
    expect(() => generatePlan({ formation, players, pinned: { ST: 'p1', LB: 'p1' } })).toThrow(/more than one/);
    expect(() => generatePlan({ formation, players, goalkeeperIds: ['gk0'], pinned: { ST: 'gk0' } })).toThrow(/Goalkeeper/);
  });
});
