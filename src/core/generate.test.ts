import { describe, expect, it } from 'vitest';
import { FORMATIONS, getFormation } from './formations';
import { generatePlan, chooseGoalkeepers } from './generate';
import { rating } from './fit';
import { planGroupSizes } from './groups';
import { lineupAt } from './plan';
import { ROLES, type Player, type Rating, type Role } from './types';

function player(id: string, preferred: Role[], secondary: Role[] = []): Player {
  const ratings: Partial<Record<Role, Rating>> = {};
  preferred.forEach((r) => (ratings[r] = 3));
  secondary.forEach((r) => (ratings[r] = 2));
  return { id, name: id, ratings };
}

function keeper(id = 'gk'): Player {
  return player(id, ['GK']);
}

function randomSquad(outfield: number, seed: number): Player[] {
  let a = seed;
  const rand = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 2 ** 32;
  };
  const players: Player[] = [keeper()];
  for (let i = 0; i < outfield; i++) {
    const ratings: Partial<Record<Role, Rating>> = {};
    for (const role of ROLES) if (role !== 'GK') ratings[role] = Math.floor(rand() * 4) as Rating;
    players.push({ id: `p${i}`, name: `p${i}`, ratings });
  }
  return players;
}

describe('generatePlan invariants', () => {
  const cases = Array.from({ length: 11 }, (_, i) => i + 10).flatMap((n) =>
    ['433', '442', '352'].map((f) => [n, f] as const),
  );

  it.each(cases)('%i outfield players, formation %s', (n, formationId) => {
    const formation = getFormation(formationId);
    const players = randomSquad(n, n * 31 + formationId.length);
    const plan = generatePlan({ formation, players });
    const slotIds = formation.slots.map((s) => s.id).sort();

    // 11 distinct players fill every slot at every minute
    for (let minute = 0; minute < plan.matchMinutes; minute++) {
      const lineup = lineupAt(plan, minute);
      expect(Object.keys(lineup).sort()).toEqual(slotIds);
      expect(new Set(Object.values(lineup)).size).toBe(11);
    }

    // minutes add up and match each group's share, within a minute of rounding
    expect(Object.values(plan.minutes).reduce((a, b) => a + b, 0)).toBe(11 * plan.matchMinutes);
    for (const group of plan.groups) {
      const g = group.memberIds.length;
      const expected = g === 1 ? plan.matchMinutes : (plan.matchMinutes * (g - 1)) / g;
      for (const id of group.memberIds) {
        expect(Math.abs(plan.minutes[id] - expected)).toBeLessThan(1);
      }
    }

    // substitutions only happen at the group's windows
    const windows = new Set(plan.groups.flatMap((g) => g.windows));
    for (const sub of plan.substitutions) expect(windows.has(sub.minute)).toBe(true);

    // everyone is accounted for exactly once
    const everyone = [...plan.groups.flatMap((g) => g.memberIds), plan.goalkeepers[0].playerId];
    expect(everyone.sort()).toEqual(players.map((p) => p.id).sort());
    expect(plan.startingBench).toHaveLength(n - 10);
    // one bench place per group, ten places on the pitch, and nobody left over
    const sizes = plan.groups.map((g) => g.memberIds.length);
    expect(sizes.reduce((a, g) => a + (g === 1 ? 1 : g - 1), 0)).toBe(10);
    expect(plan.groups.filter((g) => g.memberIds.length > 1)).toHaveLength(n - 10);
    // playing time is split as evenly as possible, whatever the ratings are
    const fairest = planGroupSizes(n);
    expect([...sizes].sort()).toEqual([...fairest.groupSizes, ...Array(fairest.fullTime).fill(1)].sort());
  });

  it('is deterministic', () => {
    const players = randomSquad(14, 7);
    const formation = getFormation('433');
    expect(generatePlan({ formation, players })).toEqual(generatePlan({ formation, players }));
  });
});

describe('generatePlan quality', () => {
  it('keeps rotation groups within one line and uses preferred positions when the squad allows it', () => {
    const defence: Role[] = ['LB', 'CB', 'RB'];
    const midfield: Role[] = ['CM', 'DM', 'AM', 'LM', 'RM'];
    const attack: Role[] = ['LW', 'ST', 'RW'];
    const players = [
      keeper(),
      ...Array.from({ length: 6 }, (_, i) => player(`D${i}`, defence)),
      ...Array.from({ length: 4 }, (_, i) => player(`M${i}`, midfield)),
      ...Array.from({ length: 4 }, (_, i) => player(`A${i}`, attack)),
    ];
    const formation = getFormation('433');
    const plan = generatePlan({ formation, players });
    expect(plan.warnings).toEqual([]);
    const roleOf = new Map(formation.slots.map((s) => [s.id, s.role]));
    const lineOf = (id: string) => id[0];
    for (let minute = 0; minute < 90; minute++) {
      for (const [slot, id] of Object.entries(lineupAt(plan, minute))) {
        if (id === 'gk') continue;
        const line = defence.includes(roleOf.get(slot)!) ? 'D' : attack.includes(roleOf.get(slot)!) ? 'A' : 'M';
        expect(lineOf(id)).toBe(line);
      }
    }
  });

  it('shows the direct-swap substitution format for a 14 player squad', () => {
    const players = randomSquad(14, 3);
    const plan = generatePlan({ formation: getFormation('442'), players });
    expect(plan.substitutions.map((s) => s.minute)).toEqual(
      [...plan.substitutions.map((s) => s.minute)].sort((a, b) => a - b),
    );
    for (const minute of plan.substitutions.map((s) => s.minute)) expect([22, 30, 45, 60, 67]).toContain(minute);
  });

  it('warns about unsuited players when nobody fits', () => {
    const players = [keeper(), ...Array.from({ length: 10 }, (_, i) => player(`d${i}`, ['CB']))];
    const plan = generatePlan({ formation: getFormation('433'), players });
    expect(plan.warnings.some((w) => w.type === 'unsuited-position')).toBe(true);
  });
});

describe('goalkeepers', () => {
  it('lets two keepers play a half each', () => {
    const players = [keeper('a'), keeper('b'), ...randomSquad(13, 5).slice(1)];
    const plan = generatePlan({ formation: getFormation('442'), players });
    expect(plan.starting['GK']).toBe('a');
    expect(lineupAt(plan, 44)['GK']).toBe('a');
    expect(lineupAt(plan, 45)['GK']).toBe('b');
    expect(plan.minutes['a']).toBe(45);
    expect(plan.minutes['b']).toBe(45);
    expect(plan.startingBench).toContain('b');
  });

  it('picks the single best-rated keeper when nobody is rated 3', () => {
    const a = { ...player('a', []), ratings: { GK: 1 as Rating } };
    const b = { ...player('b', []), ratings: { GK: 2 as Rating } };
    expect(chooseGoalkeepers([a, b])).toEqual(['b']);
  });

  it('honours explicitly chosen keepers', () => {
    const players = randomSquad(12, 9);
    const plan = generatePlan({ formation: getFormation('442'), players, goalkeeperIds: ['p3'] });
    expect(plan.starting['GK']).toBe('p3');
    expect(plan.minutes['p3']).toBe(90);
  });

  it('rejects unknown keepers and too small squads', () => {
    expect(() => generatePlan({ formation: getFormation('442'), players: randomSquad(12, 1), goalkeeperIds: ['x'] })).toThrow();
    expect(() => generatePlan({ formation: getFormation('442'), players: randomSquad(9, 1) })).toThrow();
  });
});

describe('every formation', () => {
  it.each(FORMATIONS.map((f) => [f.id] as const))('%s produces a plan for 15 players', (id) => {
    const plan = generatePlan({ formation: getFormation(id), players: randomSquad(14, 11) });
    expect(plan.groups).toHaveLength(4);
  });
});
