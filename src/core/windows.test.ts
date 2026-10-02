import { describe, expect, it } from 'vitest';
import { groupWindows, minutesPerSegmentSitOut } from './windows';
import { planGoalkeepers } from './goalkeepers';

describe('groupWindows', () => {
  it.each([
    [2, [45]],
    [3, [30, 60]],
    [4, [22, 45, 67]],
    [5, [18, 36, 54, 72]],
    [6, [15, 30, 45, 60, 75]],
  ])('group of %i swaps at %j', (g, expected) => {
    expect(groupWindows(g)).toEqual(expected);
  });

  it('scales to other match lengths', () => {
    expect(groupWindows(3, 60)).toEqual([20, 40]);
  });

  it('rejects groups smaller than 2', () => {
    expect(() => groupWindows(1)).toThrow();
  });

  it('gives each member nearly the same minutes', () => {
    for (let g = 2; g <= 6; g++) {
      const minutes = minutesPerSegmentSitOut(g);
      expect(Math.max(...minutes) - Math.min(...minutes)).toBeLessThanOrEqual(1);
      const avg = (90 * (g - 1)) / g;
      minutes.forEach((m) => expect(Math.abs(m - avg)).toBeLessThan(1));
    }
  });
});

describe('planGoalkeepers', () => {
  it('lets a single keeper play the whole match', () => {
    expect(planGoalkeepers(['a'])).toEqual([{ playerId: 'a', from: 0, to: 90 }]);
  });

  it('splits the match in half for two keepers', () => {
    expect(planGoalkeepers(['a', 'b'])).toEqual([
      { playerId: 'a', from: 0, to: 45 },
      { playerId: 'b', from: 45, to: 90 },
    ]);
  });

  it('requires one or two keepers', () => {
    expect(() => planGoalkeepers([])).toThrow();
    expect(() => planGoalkeepers(['a', 'b', 'c'])).toThrow();
  });
});
