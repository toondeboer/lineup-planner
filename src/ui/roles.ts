import { ROLES, type Player, type Rating, type Role } from '../core';

export const ROLE_NAMES: Record<Role, string> = {
  GK: 'Goalkeeper',
  LB: 'Left back',
  CB: 'Centre back',
  RB: 'Right back',
  DM: 'Defensive mid',
  CM: 'Central mid',
  AM: 'Attacking mid',
  LM: 'Left mid',
  RM: 'Right mid',
  LW: 'Left wing',
  RW: 'Right wing',
  ST: 'Striker',
};

export const RATING_LABELS: Record<Rating, string> = { 0: 'No', 1: 'Emergency', 2: 'OK', 3: 'Preferred' };

/** Positions a player is rated 3 (preferred) for, falling back to 2. */
export function mainRoles(player: Player): Role[] {
  const preferred = ROLES.filter((r) => player.ratings[r] === 3);
  return preferred.length ? preferred : ROLES.filter((r) => player.ratings[r] === 2);
}

export function roleSummary(player: Player): string {
  const roles = mainRoles(player);
  return roles.length ? roles.join(' · ') : 'No positions yet';
}
