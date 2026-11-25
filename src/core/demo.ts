import { ROLES, type Player, type Rating, type Role } from './types';

/** Ratings with the given roles at 3 (preferred), 2 (OK) and 1 (emergency); every other outfield role at 0. */
function ratings(preferred: Role[], ok: Role[] = [], emergency: Role[] = []): Partial<Record<Role, Rating>> {
  const out: Partial<Record<Role, Rating>> = {};
  for (const role of ROLES) if (role !== 'GK') out[role] = 0;
  for (const role of emergency) out[role] = 1;
  for (const role of ok) out[role] = 2;
  for (const role of preferred) out[role] = 3;
  return out;
}

/** A realistic amateur squad: one keeper and 14 outfield players spread over every line. */
const DEMO_PLAYERS: { name: string; ratings: Partial<Record<Role, Rating>> }[] = [
  { name: 'Sam', ratings: { GK: 3 } },
  { name: 'Noah', ratings: ratings(['CB'], ['DM'], ['LB', 'RB']) },
  { name: 'Liam', ratings: ratings(['CB'], ['RB'], ['LB']) },
  { name: 'Daan', ratings: ratings(['CB'], ['LB'], ['DM']) },
  { name: 'Milan', ratings: ratings(['LB'], ['LM'], ['CB', 'LW']) },
  { name: 'Jesse', ratings: ratings(['RB'], ['RM', 'CB'], ['RW']) },
  { name: 'Finn', ratings: ratings(['DM', 'CM'], ['CB']) },
  { name: 'Luuk', ratings: ratings(['CM'], ['AM', 'DM']) },
  { name: 'Sem', ratings: ratings(['CM'], ['DM'], ['LM', 'RM']) },
  { name: 'Lucas', ratings: ratings(['AM'], ['CM', 'ST']) },
  { name: 'Thijs', ratings: ratings(['LM', 'LW'], [], ['LB', 'CM']) },
  { name: 'Mees', ratings: ratings(['RM', 'RW'], [], ['RB', 'AM']) },
  { name: 'Bram', ratings: ratings(['LW'], ['RW', 'ST', 'LM']) },
  { name: 'Ruben', ratings: ratings(['ST'], [], ['AM', 'LW', 'RW', 'LM', 'RM']) },
  // the backup keeper: an outfield player who can go in goal in an emergency
  { name: 'Owen', ratings: { ...ratings(['ST'], ['RW', 'AM'], ['RM']), GK: 1 } },
];

/** A 15-player demo squad to try the app with, marked `isDemo`. `makeId` gives each player a fresh id. */
export function demoSquad(makeId: () => string): Player[] {
  return DEMO_PLAYERS.map((p) => ({ id: makeId(), name: p.name, ratings: { ...p.ratings }, isDemo: true }));
}
