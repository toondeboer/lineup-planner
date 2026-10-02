import { penalty, pitchDistance } from './fit';
import type { Player, Slot } from './types';

export interface GroupSolution {
  cost: number;
  /** Members in the order they sit out: member 0 starts on the bench, member k sits out segment k. */
  order: Player[];
  /**
   * slotOrder[k - 1] is the slot member k plays at kick-off (k >= 1).
   * When member k leaves, member k - 1 comes on and takes this slot.
   */
  slotOrder: Slot[];
}

export const MAX_SOLVABLE_GROUP = 7;

/** Cost added for each broken pin. Large enough to dominate every rating cost. */
export const PIN_VIOLATION = 1e6;

/** Kick-off pins: players who must start in a given slot. */
export interface Pins {
  bySlot: ReadonlyMap<string, string>;
  byPlayer: ReadonlyMap<string, string>;
}

export function makePins(slotToPlayer: Record<string, string>): Pins {
  const entries = Object.entries(slotToPlayer);
  return {
    bySlot: new Map(entries),
    byPlayer: new Map(entries.map(([slot, player]) => [player, slot])),
  };
}

function violates(pins: Pins | undefined, player: Player, slot: Slot): boolean {
  if (!pins) return false;
  const wantedSlot = pins.byPlayer.get(player.id);
  const wantedPlayer = pins.bySlot.get(slot.id);
  return (wantedSlot !== undefined && wantedSlot !== slot.id) || (wantedPlayer !== undefined && wantedPlayer !== player.id);
}

/** Weight of keeping a group's slots close together, per match minute. */
const COHESION_PER_MINUTE = 0.4;

/**
 * Finds the best way to rotate `members` over `slots` for a group with one bench place.
 *
 * `segments[k]` is the length of segment k; member k sits out segment k. Substitutions are
 * direct swaps: whoever comes on takes the slot of the player going off. That fixes everyone's
 * slots once we know the kick-off arrangement and the sit-out order, so the cost is
 * a chain over (member, slot) choices which we solve exactly with a memoised search.
 *
 * A group of one (a full-time player) just takes its only slot.
 *
 * With `pins`, players must start in their pinned slot; broken pins add `PIN_VIOLATION` to the cost.
 */
export function solveGroup(members: Player[], slots: Slot[], segments: number[], pins?: Pins): GroupSolution {
  const g = members.length;
  if (slots.length !== g - 1 && !(g === 1 && slots.length === 1)) {
    throw new Error(`A group of ${g} must cover ${g === 1 ? 1 : g - 1} slots, got ${slots.length}`);
  }
  if (g > MAX_SOLVABLE_GROUP) throw new Error(`Groups of more than ${MAX_SOLVABLE_GROUP} players are not supported`);
  const matchMinutes = segments.reduce((a, b) => a + b, 0);

  if (g === 1) {
    return {
      cost: matchMinutes * penalty(members[0], slots[0].role) + (violates(pins, members[0], slots[0]) ? PIN_VIOLATION : 0),
      order: [members[0]],
      slotOrder: [slots[0]],
    };
  }

  const before: number[] = []; // minutes before segment k
  const after: number[] = []; // minutes after segment k
  let acc = 0;
  segments.forEach((len, k) => {
    before[k] = acc;
    acc += len;
  });
  segments.forEach((len, k) => {
    after[k] = acc - before[k] - len;
  });

  const pen = members.map((m) => slots.map((s) => penalty(m, s.role)));
  const p = slots.length;
  const stride = p + 1;
  const states = (1 << g) * (1 << p) * stride;
  const memoCost = new Float64Array(states).fill(-1);
  const memoPick = new Int8Array(states);
  const memoNext = new Int8Array(states);
  const index = (memberMask: number, slotMask: number, slotK: number) =>
    ((memberMask << p) | slotMask) * stride + slotK + 1;

  // Choose the member who sits out segment k, given the slot `slotK` they play before that.
  const solve = (k: number, memberMask: number, slotMask: number, slotK: number): number => {
    const key = index(memberMask, slotMask, slotK);
    if (memoCost[key] >= 0) return memoCost[key];
    let best = { cost: Infinity, pick: -1, next: -1 };
    for (let m = 0; m < g; m++) {
      if (memberMask & (1 << m)) continue;
      // Pinned players start on the pitch, in their pinned slot.
      const own =
        k === 0
          ? pins?.byPlayer.has(members[m].id)
            ? PIN_VIOLATION
            : 0
          : before[k] * pen[m][slotK] + (violates(pins, members[m], slots[slotK]) ? PIN_VIOLATION : 0);
      if (k === g - 1) {
        if (own < best.cost) best = { cost: own, pick: m, next: -1 };
        continue;
      }
      for (let t = 0; t < slots.length; t++) {
        if (slotMask & (1 << t)) continue;
        const cost = own + after[k] * pen[m][t] + solve(k + 1, memberMask | (1 << m), slotMask | (1 << t), t);
        if (cost < best.cost) best = { cost, pick: m, next: t };
      }
    }
    memoCost[key] = best.cost;
    memoPick[key] = best.pick;
    memoNext[key] = best.next;
    return best.cost;
  };

  const rating = solve(0, 0, 0, -1);

  const order: Player[] = [];
  const slotOrder: Slot[] = [];
  let memberMask = 0;
  let slotMask = 0;
  let slotK = -1;
  for (let k = 0; k < g; k++) {
    const key = index(memberMask, slotMask, slotK);
    const pick = memoPick[key];
    const next = memoNext[key];
    order.push(members[pick]);
    memberMask |= 1 << pick;
    if (next >= 0) {
      slotOrder.push(slots[next]);
      slotMask |= 1 << next;
    }
    slotK = next;
  }

  return { cost: rating + cohesionCost(slots, matchMinutes), order, slotOrder };
}

export function cohesionCost(slots: Slot[], matchMinutes: number): number {
  let total = 0;
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) total += pitchDistance(slots[i], slots[j]);
  }
  return COHESION_PER_MINUTE * matchMinutes * total;
}
