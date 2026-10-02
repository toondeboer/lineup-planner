import type { GoalkeeperStint } from './goalkeepers';
import type { Formation } from './types';

export interface PlanGroup {
  id: string;
  /** Slots this group covers (one for a full-time player). */
  slotIds: string[];
  /**
   * Members in sit-out order: the first one starts on the bench, the k-th one sits out the
   * k-th segment. A full-time player is a group of one.
   */
  memberIds: string[];
  /** Minutes at which this group makes a substitution. Empty for full-time players. */
  windows: number[];
}

export interface Substitution {
  minute: number;
  slotId: string;
  offId: string;
  onId: string;
}

export interface PlanWarning {
  type: 'unsuited-position' | 'no-goalkeeper-rating';
  playerId: string;
  slotId?: string;
  from?: number;
  to?: number;
}

export interface Plan {
  formationId: string;
  matchMinutes: number;
  goalkeepers: GoalkeeperStint[];
  groups: PlanGroup[];
  /** Slot id -> player id at kick-off, including the goalkeeper slot. */
  starting: Record<string, string>;
  /** Players on the bench at kick-off. */
  startingBench: string[];
  /** All substitutions, including a goalkeeper change, ordered by minute. */
  substitutions: Substitution[];
  /** Minutes on the pitch per player. */
  minutes: Record<string, number>;
  warnings: PlanWarning[];
}

/** Slot id -> player id on the pitch at the given minute (substitutions at that minute applied). */
export function lineupAt(plan: Plan, minute: number): Record<string, string> {
  const lineup = { ...plan.starting };
  for (const sub of plan.substitutions) {
    if (sub.minute <= minute) lineup[sub.slotId] = sub.onId;
  }
  return lineup;
}

export function slotGoalkeeper(formation: Formation): string {
  const slot = formation.slots.find((s) => s.role === 'GK');
  if (!slot) throw new Error(`Formation ${formation.id} has no goalkeeper slot`);
  return slot.id;
}

