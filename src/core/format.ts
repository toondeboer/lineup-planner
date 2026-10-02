import type { Plan } from './plan';
import type { Player } from './types';

export interface SubstitutionLine {
  minute: number;
  slotId: string;
  on: string;
  off: string;
}

/** Substitutions with names instead of ids, ordered by minute. */
export function substitutionLines(plan: Plan, players: Player[]): SubstitutionLine[] {
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  return plan.substitutions.map((s) => ({
    minute: s.minute,
    slotId: s.slotId,
    on: name(s.onId),
    off: name(s.offId),
  }));
}
