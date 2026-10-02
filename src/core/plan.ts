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

/** A teammate who changes position at a substitution. */
export interface PositionChange {
  playerId: string;
  fromSlotId: string;
  toSlotId: string;
}

export interface Substitution {
  minute: number;
  /** Slot the player going off leaves. */
  slotId: string;
  offId: string;
  onId: string;
  /** Slot the incoming player takes. Equals `slotId` unless teammates shift around. */
  onSlotId: string;
  /** Teammates who change position as part of this substitution. */
  moves: PositionChange[];
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
  /** Player-minutes at each rating of the position played (goalkeepers included). */
  fit: Record<'preferred' | 'ok' | 'emergency' | 'unsuited', number>;
  warnings: PlanWarning[];
}

/** Slot id -> player id on the pitch at the given minute (substitutions at that minute applied). */
export function lineupAt(plan: Plan, minute: number): Record<string, string> {
  const lineup = { ...plan.starting };
  for (const sub of plan.substitutions) {
    if (sub.minute > minute) continue;
    // Vacate every slot involved first, then fill them, so teammates can swap places.
    delete lineup[sub.slotId];
    for (const move of sub.moves) delete lineup[move.fromSlotId];
    lineup[sub.onSlotId] = sub.onId;
    for (const move of sub.moves) lineup[move.toSlotId] = move.playerId;
  }
  return lineup;
}

export function slotGoalkeeper(formation: Formation): string {
  const slot = formation.slots.find((s) => s.role === 'GK');
  if (!slot) throw new Error(`Formation ${formation.id} has no goalkeeper slot`);
  return slot.id;
}

