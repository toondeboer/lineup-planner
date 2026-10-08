import { describe, expect, it } from 'vitest';
import { getFormation } from './formations';
import { generatePlan } from './generate';
import { lineOf, lineSizings } from './lines';
import { lineupAt } from './plan';
import { describeRotation } from './summary';
import type { Player, Rating, Role } from './types';

const f433 = getFormation('433');

function player(id: string, roles: Role[]): Player {
  return { id, name: id, ratings: Object.fromEntries(roles.map((r) => [r, 3 as Rating])) };
}

/** 14 players: a keeper, 5 defenders, 4 midfielders and 4 attackers. */
function squadPerLine(): Player[] {
  return [
    player('gk', ['GK']),
    ...Array.from({ length: 5 }, (_, i) => player(`D${i}`, ['LB', 'CB', 'RB'])),
    ...Array.from({ length: 4 }, (_, i) => player(`M${i}`, ['CM', 'DM', 'AM'])),
    ...Array.from({ length: 4 }, (_, i) => player(`A${i}`, ['LW', 'ST', 'RW'])),
  ];
}

describe('lineSizings', () => {
  it('gives each line of a 4-3-3 one group of 4 with 13 outfield players, plus one full-time defender', () => {
    const best = lineSizings(f433.slots, 13)[0];
    expect(best.groups).toEqual([
      { line: 'defence', size: 4 },
      { line: 'midfield', size: 4 },
      { line: 'attack', size: 4 },
      { line: 'defence', size: 1 },
    ]);
  });

  it('keeps every group within the slots of its line', () => {
    for (const formation of [f433, getFormation('442'), getFormation('352')]) {
      for (let n = 10; n <= 20; n++) {
        const { groups } = lineSizings(formation.slots, n)[0];
        for (const line of ['defence', 'midfield', 'attack'] as const) {
          const covered = groups.filter((g) => g.line === line).reduce((a, g) => a + (g.size === 1 ? 1 : g.size - 1), 0);
          expect(covered).toBe(formation.slots.filter((s) => lineOf(s.role) === line).length);
        }
        expect(groups.filter((g) => g.size > 1)).toHaveLength(n - 10);
      }
    }
  });
});

describe('line rotation (default)', () => {
  it('plans a 14 player squad in a 4-3-3 as one group per line, swapping every quarter', () => {
    const plan = generatePlan({ formation: f433, players: squadPerLine() });
    expect(plan.warnings).toEqual([]);
    expect(plan.fit.preferred).toBe(990);
    expect([...new Set(plan.substitutions.map((s) => s.minute))]).toEqual([22, 45, 67]);

    // every player stays in their own line all match
    const roleOf = new Map(f433.slots.map((s) => [s.id, s.role]));
    const lineByLetter = { D: 'defence', M: 'midfield', A: 'attack' } as const;
    for (let minute = 0; minute < 90; minute++) {
      for (const [slot, id] of Object.entries(lineupAt(plan, minute))) {
        if (id === 'gk') continue;
        expect(lineOf(roleOf.get(slot)!)).toBe(lineByLetter[id[0] as 'D' | 'M' | 'A']);
      }
    }

    // one defender plays the whole match, everyone else three quarters
    const minutes = Object.entries(plan.minutes).filter(([id]) => id !== 'gk');
    expect(minutes.filter(([, m]) => m === 90).map(([id]) => id[0])).toEqual(['D']);
    for (const [, m] of minutes) expect([67, 68, 90]).toContain(m);
  });

  it('describes the groups per line', () => {
    expect(describeRotation(14, 1, { formation: f433 })).toBe(
      "Defence: 4 players (¾) + 1 full match · Midfield: 4 players (¾) · Attack: 4 players (¾). Substitutions at 22', 45', 67'.",
    );
  });

  it('can still mix lines for the most equal playing time', () => {
    const plan = generatePlan({ formation: f433, players: squadPerLine(), rotation: 'equal' });
    expect(Math.max(...Object.values(plan.minutes).filter((m) => m < 90))).toBe(72);
  });
});
