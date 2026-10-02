import { describe, expect, it } from 'vitest';
import { describeRotation } from './summary';

describe('describeRotation', () => {
  it('describes mixed groups', () => {
    expect(describeRotation(15)).toBe('4 rotation groups: 2 × 4 (¾), 2 × 3 (⅔).');
  });
  it('describes full-time players for small squads', () => {
    expect(describeRotation(13)).toBe('2 rotation groups: 2 × 6 (⅚).');
    expect(describeRotation(12)).toBe('1 rotation group: 1 × 6 (⅚), 5 full match.');
  });
  it('handles no substitutes and bad sizes', () => {
    expect(describeRotation(11)).toMatch(/groups|No substitutes/);
    expect(describeRotation(5)).toMatch(/at least 11/);
    expect(describeRotation(30)).toMatch(/Too many/);
  });
});
