import { describe, expect, it } from 'vitest';
import { getFormation } from './formations';
import { formatShareMessage, substitutionLines } from './format';
import { generatePlan } from './generate';
import type { Player } from './types';

const players: Player[] = [
  { id: 'gk', name: 'Gerrit', ratings: { GK: 3 } },
  ...Array.from({ length: 14 }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    ratings: { CB: 2, CM: 2, ST: 2, LB: 2, RB: 2, LW: 2, RW: 2 } as Player['ratings'],
  })),
];

describe('share message', () => {
  const formation = getFormation('433');
  const plan = generatePlan({ formation, players });

  it('lists every substitution once, grouped by minute, with names', () => {
    const text = formatShareMessage(plan, players, formation.name, 'Sunday');
    expect(text.startsWith("⚽ *Sunday* (4-3-3)")).toBe(true);
    expect(text).toContain('*Substitutions*');
    expect(text.match(/ on for /g)).toHaveLength(plan.substitutions.length);
    for (const minute of new Set(plan.substitutions.map((s) => s.minute))) {
      expect(text).toContain(`\n${minute}'\n`);
    }
    expect(text).not.toMatch(/\bp\d+\b/);
    expect(text).toContain('Bench at kick-off:');
  });

  it('turns substitutions into lines with names', () => {
    const lines = substitutionLines(plan, players);
    expect(lines).toHaveLength(plan.substitutions.length);
    expect(lines[0].on).toMatch(/Player|Gerrit/);
  });

  it('handles a plan without substitutions', () => {
    const ten = [players[0], ...players.slice(1, 11)];
    const noSubs = generatePlan({ formation, players: ten });
    expect(formatShareMessage(noSubs, ten, formation.name)).toContain('No substitutions.');
  });

  it('mentions teammates who change position', () => {
    const sub = plan.substitutions[0];
    const withMove = {
      ...plan,
      substitutions: [
        { ...sub, onSlotId: 'CB1', moves: [{ playerId: 'p3', fromSlotId: 'CB1', toSlotId: sub.slotId }] },
      ],
    };
    const text = formatShareMessage(withMove, players, formation.name);
    expect(text).toContain('plays CB1');
    expect(text).toContain(`↳ Player 3 moves to ${sub.slotId}`);
  });
});
