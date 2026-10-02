import { describe, expect, it } from 'vitest';
import { OUTFIELD_SLOTS, planGroupSizes } from './groups';

describe('planGroupSizes', () => {
  it.each([
    [14, [4, 4, 3, 3], 0],
    [15, [3, 3, 3, 3, 3], 0],
    [16, [3, 3, 3, 3, 2, 2], 0],
    [17, [3, 3, 3, 2, 2, 2, 2], 0],
    [18, [3, 3, 2, 2, 2, 2, 2, 2], 0],
    [20, Array(10).fill(2), 0],
  ])('%i outfield players -> groups %j with %i full-time', (n, sizes, fullTime) => {
    const result = planGroupSizes(n);
    expect(result.groupSizes).toEqual(sizes);
    expect(result.fullTime).toBe(fullTime);
  });

  it('uses larger groups for small squads', () => {
    expect(planGroupSizes(13).groupSizes).toEqual([5, 4, 4]);
    expect(planGroupSizes(12).groupSizes).toEqual([6, 6]);
  });

  it('keeps everyone full-time with exactly 10 outfield players', () => {
    expect(planGroupSizes(10)).toMatchObject({ groupSizes: [], fullTime: 10, spread: 0 });
  });

  it('falls back to full-time players when the cap prevents a fair split', () => {
    const r = planGroupSizes(11);
    expect(r.groupSizes).toEqual([6]);
    expect(r.fullTime).toBe(5);
    expect(planGroupSizes(11, { maxGroupSize: 11 }).groupSizes).toEqual([11]);
  });

  it.each(Array.from({ length: 11 }, (_, i) => i + 10))('is consistent for %i outfield players', (n) => {
    const { groupSizes, fullTime } = planGroupSizes(n);
    expect(groupSizes).toHaveLength(n - OUTFIELD_SLOTS);
    // every player is in exactly one group or is full-time
    expect(groupSizes.reduce((a, b) => a + b, 0) + fullTime).toBe(n);
    // exactly 10 are on the pitch at any moment
    expect(groupSizes.reduce((a, g) => a + g - 1, 0) + fullTime).toBe(OUTFIELD_SLOTS);
  });

  it('rejects impossible squad sizes', () => {
    expect(() => planGroupSizes(9)).toThrow();
    expect(() => planGroupSizes(21)).toThrow();
  });
});
