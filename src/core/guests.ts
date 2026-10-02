import { ROLES, type Player, type Rating, type Role } from './types';

const LINES: Role[][] = [
  ['LB', 'CB', 'RB'],
  ['DM', 'CM', 'AM', 'LM', 'RM'],
  ['LW', 'ST', 'RW'],
];

/**
 * Ratings for a player entered quickly, e.g. a guest: "plays X" prefers that role and can
 * cover the rest of the same line in an emergency; "any" is an emergency option everywhere
 * outfield. Keepers only play in goal.
 */
export function quickRatings(position: Role | 'ANY'): Partial<Record<Role, Rating>> {
  const ratings: Partial<Record<Role, Rating>> = {};
  if (position === 'GK') {
    ratings.GK = 3;
    return ratings;
  }
  for (const role of ROLES) if (role !== 'GK') ratings[role] = 0;
  if (position === 'ANY') {
    for (const role of ROLES) if (role !== 'GK') ratings[role] = 1;
    return ratings;
  }
  const line = LINES.find((l) => l.includes(position)) ?? [];
  for (const role of line) ratings[role] = 1;
  ratings[position] = 3;
  return ratings;
}

export function newGuest(id: string, name: string, position: Role | 'ANY'): Player {
  return { id, name, ratings: quickRatings(position), isGuest: true };
}
