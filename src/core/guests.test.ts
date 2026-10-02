import { describe, expect, it } from 'vitest';
import { newGuest, quickRatings } from './guests';

describe('quickRatings', () => {
  it('prefers the chosen role and allows the rest of the line in an emergency', () => {
    expect(quickRatings('CB')).toMatchObject({ CB: 3, LB: 1, RB: 1, ST: 0, CM: 0 });
  });

  it('lets "any" cover every outfield role in an emergency', () => {
    const r = quickRatings('ANY');
    expect(r.GK).toBeUndefined();
    expect(Object.values(r).every((v) => v === 1)).toBe(true);
  });

  it('keeps keepers in goal', () => {
    expect(quickRatings('GK')).toEqual({ GK: 3 });
  });

  it('marks guests', () => {
    expect(newGuest('g1', 'Sam', 'ST')).toMatchObject({ id: 'g1', name: 'Sam', isGuest: true });
  });
});
