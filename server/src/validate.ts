import { emptyMatch, type MatchState } from '../../src/core/match';
import { ROLES, type Player, type Rating, type Role } from '../../src/core/types';

export const LIMITS = {
  bodyBytes: 64 * 1024,
  teamName: 60,
  displayName: 40,
  playerName: 60,
  squad: 60,
  guests: 30,
  availableIds: 100,
  goalkeepers: 2,
  pins: 11,
} as const;

/** A request body or field that is not valid. Becomes a 400 with `error: <code>`. */
export class InvalidError extends Error {
  constructor(public readonly field: string) {
    super(`invalid_${field}`);
  }
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function object(v: unknown, field = 'body'): Record<string, unknown> {
  if (!isObject(v)) throw new InvalidError(field);
  return v;
}

/** Trimmed text of 1..max characters without control characters. */
export function text(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string') throw new InvalidError(field);
  const t = v.trim();
  if (t.length === 0 || t.length > max || CONTROL.test(t)) throw new InvalidError(field);
  return t;
}

export function id(v: unknown, field = 'id'): string {
  if (typeof v !== 'string' || !ID.test(v)) throw new InvalidError(field);
  return v;
}

function ids(v: unknown, field: string, max: number): string[] {
  if (!Array.isArray(v) || v.length > max) throw new InvalidError(field);
  const out = v.map((x) => id(x, field));
  if (new Set(out).size !== out.length) throw new InvalidError(field);
  return out;
}

function ratings(v: unknown, field: string): Partial<Record<Role, Rating>> {
  const obj = object(v, field);
  const out: Partial<Record<Role, Rating>> = {};
  for (const [role, rating] of Object.entries(obj)) {
    if (!(ROLES as readonly string[]).includes(role)) throw new InvalidError(field);
    if (rating !== 0 && rating !== 1 && rating !== 2 && rating !== 3) throw new InvalidError(field);
    out[role as Role] = rating;
  }
  return out;
}

/** A squad player or guest. Unknown fields are dropped. */
export function player(v: unknown, field = 'player'): Player {
  const obj = object(v, field);
  const out: Player = {
    id: id(obj.id, field),
    name: text(obj.name, field, LIMITS.playerName),
    ratings: ratings(obj.ratings, field),
  };
  for (const flag of ['isGuest', 'isDemo'] as const) {
    if (obj[flag] === undefined) continue;
    if (typeof obj[flag] !== 'boolean') throw new InvalidError(field);
    if (obj[flag]) out[flag] = true;
  }
  return out;
}

function players(v: unknown, field: string, max: number): Player[] {
  if (!Array.isArray(v) || v.length > max) throw new InvalidError(field);
  const out = v.map((p) => player(p, field));
  if (new Set(out.map((p) => p.id)).size !== out.length) throw new InvalidError(field);
  return out;
}

export const squad = (v: unknown) => players(v, 'squad', LIMITS.squad);

const MATCH_FIELDS: { [K in keyof MatchState]: (v: unknown) => MatchState[K] } = {
  availableIds: (v) => ids(v, 'availableIds', LIMITS.availableIds),
  guests: (v) => players(v, 'guests', LIMITS.guests),
  formationId: (v) => id(v, 'formationId'),
  goalkeeperIds: (v) => ids(v, 'goalkeeperIds', LIMITS.goalkeepers),
  pinned: (v) => {
    const obj = object(v, 'pinned');
    const entries = Object.entries(obj);
    if (entries.length > LIMITS.pins) throw new InvalidError('pinned');
    return Object.fromEntries(entries.map(([slot, p]) => [id(slot, 'pinned'), id(p, 'pinned')]));
  },
  seed: (v) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1e9) throw new InvalidError('seed');
    return v;
  },
  strictSwaps: (v) => {
    if (typeof v !== 'boolean') throw new InvalidError('strictSwaps');
    return v;
  },
  rotation: (v) => {
    if (v !== 'lines' && v !== 'equal') throw new InvalidError('rotation');
    return v;
  },
};

/** Some fields of the match; at least one. Unknown fields are rejected. */
export function matchFields(v: unknown): Partial<MatchState> {
  const obj = object(v, 'match');
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const check = MATCH_FIELDS[key as keyof MatchState];
    if (!check) throw new InvalidError('match');
    out[key] = check(value);
  }
  if (Object.keys(out).length === 0) throw new InvalidError('match');
  return out as Partial<MatchState>;
}

/** A whole match; missing fields get their defaults. */
export function match(v: unknown): MatchState {
  if (v === undefined) return { ...emptyMatch };
  const obj = object(v, 'match');
  return Object.keys(obj).length === 0 ? { ...emptyMatch } : { ...emptyMatch, ...matchFields(obj) };
}
