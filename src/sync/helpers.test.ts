import { describe, expect, it } from 'vitest';
import { emptyMatch } from '../core';
import { formatSeen, parseInviteCode, toLink } from './helpers';

const code = '0123456789abcdef0123456789abcdef';

describe('parseInviteCode', () => {
  it.each([
    [code],
    [`  ${code.toUpperCase()} `],
    [`https://lineup.example/join/${code}`],
    [`lineup-planner://join/${code}`],
    [`Join our team: https://lineup.example/join/${code} see you Saturday`],
  ])('finds the code in %s', (text) => {
    expect(parseInviteCode(text)).toBe(code);
  });

  it.each([[''], ['hello'], [code.slice(1)], [`${code}0`]])('finds nothing in %j', (text) => {
    expect(parseInviteCode(text)).toBeUndefined();
  });
});

describe('toLink', () => {
  it("keeps what the device needs to stay a member", () => {
    const team = { id: 't1', name: 'JO17-1', inviteCode: code, version: 3, you: 'm2', members: [], players: [], match: emptyMatch };
    expect(toLink({ team, token: 'secret' })).toEqual({
      id: 't1',
      name: 'JO17-1',
      inviteCode: code,
      token: 'secret',
      memberId: 'm2',
      version: 3,
    });
  });
});

describe('formatSeen', () => {
  const now = new Date(2026, 10, 25, 15, 0);
  it.each([
    [new Date(2026, 10, 25, 9, 0), 'today'],
    [new Date(2026, 10, 24, 23, 0), 'yesterday'],
    [new Date(2026, 10, 21, 12, 0), '4 days ago'],
  ])('describes %s as %s', (date, text) => {
    expect(formatSeen(date.toISOString(), now)).toBe(text);
  });

  it('gives a date for anything older than a week', () => {
    expect(formatSeen(new Date(2026, 9, 1).toISOString(), now)).toMatch(/2026/);
  });
});
