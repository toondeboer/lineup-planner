import { describe, expect, it } from 'vitest';
import { FORMATIONS, getFormation } from './formations';

describe('formations', () => {
  it.each(FORMATIONS.map((f) => [f.id, f] as const))('%s has 11 slots with one goalkeeper', (_id, f) => {
    expect(f.slots).toHaveLength(11);
    expect(f.slots.filter((s) => s.role === 'GK')).toHaveLength(1);
    expect(new Set(f.slots.map((s) => s.id)).size).toBe(11);
  });

  it('names formation ids after their numbers', () => {
    for (const f of FORMATIONS) {
      expect(f.name.replace(/-| diamond/g, '').startsWith(f.id.replace('d', ''))).toBe(true);
    }
  });

  it('numbers duplicate roles and keeps unique roles bare', () => {
    expect(getFormation('433').slots.map((s) => s.id)).toEqual([
      'LW', 'ST', 'RW', 'CM1', 'CM2', 'CM3', 'LB', 'CB1', 'CB2', 'RB', 'GK',
    ]);
  });

  it('places the goalkeeper nearest own goal', () => {
    for (const f of FORMATIONS) {
      const gk = f.slots.find((s) => s.role === 'GK')!;
      expect(Math.max(...f.slots.map((s) => s.y))).toBe(gk.y);
    }
  });

  it('throws for unknown formations', () => {
    expect(() => getFormation('999')).toThrow();
  });
});
