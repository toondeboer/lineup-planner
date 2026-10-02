/** Positions a player can be rated for. Wing-backs use LB/RB. */
export const ROLES = [
  'GK',
  'LB',
  'CB',
  'RB',
  'DM',
  'CM',
  'AM',
  'LM',
  'RM',
  'LW',
  'RW',
  'ST',
] as const;

export type Role = (typeof ROLES)[number];

/** 0 = cannot play there, 1 = emergency, 2 = comfortable, 3 = preferred. */
export type Rating = 0 | 1 | 2 | 3;

export interface Player {
  id: string;
  name: string;
  ratings: Partial<Record<Role, Rating>>;
  isGuest?: boolean;
}

export interface Slot {
  /** Unique within a formation, e.g. "LCB". */
  id: string;
  role: Role;
  /** Pitch position in percent: x 0 (left) to 100 (right), y 0 (opponent goal) to 100 (own goal). */
  x: number;
  y: number;
}

export interface Formation {
  id: string;
  name: string;
  slots: Slot[];
}
