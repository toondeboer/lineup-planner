import { describe, expect, it } from 'vitest';
import { demoSquad } from './demo';
import { FORMATIONS } from './formations';
import { generatePlan, type Rotation } from './generate';

let next = 0;
const makeId = () => `d${next++}`;

describe('demoSquad', () => {
  it('has 15 players with unique ids and names, one of them a keeper', () => {
    const squad = demoSquad(makeId);
    expect(squad).toHaveLength(15);
    expect(new Set(squad.map((p) => p.id)).size).toBe(15);
    expect(new Set(squad.map((p) => p.name)).size).toBe(15);
    expect(squad.filter((p) => p.ratings.GK === 3)).toHaveLength(1);
  });

  it('gives fresh ids on every call', () => {
    const a = demoSquad(makeId).map((p) => p.id);
    const b = demoSquad(makeId).map((p) => p.id);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });

  // A demo should show the planner at its best: nobody in a position rated "no".
  for (const rotation of ['lines', 'equal'] as Rotation[]) {
    // Plans all formations, which takes a second or more on slow CI machines.
    it(`plans every formation without unsuited positions (${rotation} rotation)`, { timeout: 60_000 }, () => {
      const players = demoSquad(makeId);
      const unsuited = Object.fromEntries(
        FORMATIONS.map((formation) => [formation.id, generatePlan({ formation, players, rotation }).fit.unsuited]),
      );
      expect(Object.entries(unsuited).filter(([, minutes]) => minutes > 0)).toEqual([]);
    });
  }
});
