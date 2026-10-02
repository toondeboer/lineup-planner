import { penalty, pitchDistance } from './fit';
import type { Player, Slot } from './types';

export interface GroupSolution {
  cost: number;
  /** Members in the order they sit out: member 0 starts on the bench, member k sits out segment k. */
  order: Player[];
  /** assignments[k]: player id -> slot, for everyone on the pitch during segment k. */
  assignments: Record<string, Slot>[];
}

export interface SolveOptions {
  /** Kick-off pins. */
  pins?: Pins;
  /**
   * Strict mode: whoever comes on takes the exact slot of the player going off, so nobody changes
   * position. Otherwise teammates may shift position at a substitution to keep everybody in a
   * position they can play.
   */
  strict?: boolean;
  /** Small extra cost per minute for a player in a slot; used to vary between equally good plans. */
  jitter?: (playerId: string, slotId: string) => number;
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
const COHESION_PER_MINUTE = 0.1;

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
export function solveGroup(
  members: Player[],
  slots: Slot[],
  segments: number[],
  options: SolveOptions = {},
): GroupSolution {
  const g = members.length;
  if (slots.length !== g - 1 && !(g === 1 && slots.length === 1)) {
    throw new Error(`A group of ${g} must cover ${g === 1 ? 1 : g - 1} slots, got ${slots.length}`);
  }
  if (g > MAX_SOLVABLE_GROUP) throw new Error(`Groups of more than ${MAX_SOLVABLE_GROUP} players are not supported`);
  const matchMinutes = segments.reduce((a, b) => a + b, 0);
  const { pins } = options;
  const pen = members.map((m) => slots.map((s) => penalty(m, s.role) + (options.jitter?.(m.id, s.id) ?? 0)));

  if (g === 1) {
    return {
      cost: matchMinutes * pen[0][0] + (violates(pins, members[0], slots[0]) ? PIN_VIOLATION : 0),
      order: [members[0]],
      assignments: [{ [members[0].id]: slots[0] }],
    };
  }
  const solution = options.strict
    ? solveStrict(members, slots, segments, pins, pen)
    : solveFlexible(members, slots, segments, pins, pen);
  return { ...solution, cost: solution.cost + cohesionCost(slots, matchMinutes) };
}

/** Direct swaps only; see `SolveOptions.strict`. Solved exactly with a memoised search. */
function solveStrict(
  members: Player[],
  slots: Slot[],
  segments: number[],
  pins: Pins | undefined,
  pen: number[][],
): GroupSolution {
  const g = members.length;

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

  // Member k (1 <= k <= g - 2) plays slotOrder[k - 1] until they sit out, then slotOrder[k] after they
  // return; member 0 plays slotOrder[0] once they come on.
  const assignments: Record<string, Slot>[] = [];
  for (let seg = 0; seg < g; seg++) {
    const onPitch: Record<string, Slot> = {};
    order.forEach((member, k) => {
      if (k === seg) return;
      onPitch[member.id] = k === 0 || seg > k ? slotOrder[k === 0 ? 0 : k] : slotOrder[k - 1];
    });
    assignments.push(onPitch);
  }
  return { cost: rating, order, assignments };
}

export function cohesionCost(slots: Slot[], matchMinutes: number): number {
  let total = 0;
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) total += pitchDistance(slots[i], slots[j]);
  }
  return COHESION_PER_MINUTE * matchMinutes * total;
}

/** Cost of each teammate who has to change position at a substitution (keeps swaps simple). */
const MOVE_PENALTY = 20;

/** How many equally good arrangements are kept per sitter when looking for the fewest position changes. */
const MAX_ARRANGEMENTS = 12;

/** Largest group whose sit-out orders are all tried; bigger groups use one sensible order. */
const MAX_ORDER_SEARCH = 4;

function permutations(n: number): number[][] {
  const out: number[][] = [];
  const rec = (prefix: number[], rest: number[]) => {
    if (rest.length === 0) out.push(prefix);
    for (let i = 0; i < rest.length; i++) rec([...prefix, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
  };
  rec([], Array.from({ length: n }, (_, i) => i));
  return out;
}

/**
 * Teammates may change position at a substitution. For each possible sitter we find the best way to
 * spread the other members over the group's slots (an assignment problem, tiny at this size). Then we
 * pick the sit-out order and, among equally good arrangements, the ones needing the fewest moves.
 */
function solveFlexible(
  members: Player[],
  slots: Slot[],
  segments: number[],
  pins: Pins | undefined,
  pen: number[][],
): GroupSolution {
  const g = members.length;
  const p = slots.length;
  const perms = permutations(p);

  interface Arrangement {
    /** slotIndexOf[member] = slot index, or -1 for the sitter. */
    slotIndexOf: Int8Array;
  }
  interface Options {
    cost: number;
    arrangements: Arrangement[];
  }

  const build = (sitter: number, withPins: boolean): Options => {
    const others = members.map((_, i) => i).filter((i) => i !== sitter);
    let best = Infinity;
    let arrangements: Arrangement[] = [];
    for (const perm of perms) {
      let cost = withPins && pins?.byPlayer.has(members[sitter].id) ? PIN_VIOLATION : 0;
      for (let i = 0; i < p; i++) {
        const member = others[i];
        cost += pen[member][perm[i]];
        if (withPins && violates(pins, members[member], slots[perm[i]])) cost += PIN_VIOLATION;
      }
      if (cost < best - 1e-9) {
        best = cost;
        arrangements = [];
      }
      if (cost <= best + 1e-9 && arrangements.length < MAX_ARRANGEMENTS) {
        const slotIndexOf = new Int8Array(g).fill(-1);
        for (let i = 0; i < p; i++) slotIndexOf[others[i]] = perm[i];
        arrangements.push({ slotIndexOf });
      }
    }
    return { cost: best, arrangements };
  };

  const later = members.map((_, m) => build(m, false));
  const first = members.map((_, m) => build(m, true));

  const moves = (a: Arrangement, b: Arrangement): number => {
    let count = 0;
    for (let m = 0; m < g; m++) {
      const x = a.slotIndexOf[m];
      const y = b.slotIndexOf[m];
      if (x >= 0 && y >= 0 && x !== y) count++;
    }
    return count;
  };

  const byLaterCost = (a: number, b: number) => later[b].cost - later[a].cost || a - b;
  let orders: number[][];
  if (g <= MAX_ORDER_SEARCH) {
    orders = permutations(g);
  } else {
    // One sensible order per possible first sitter (pins decide who may start on the bench).
    const cheapest = Math.min(...first.map((o) => o.cost));
    orders = members
      .map((_, i) => i)
      .filter((i) => first[i].cost <= cheapest + 1e-9)
      .map((i) => [i, ...members.map((_, j) => j).filter((j) => j !== i).sort(byLaterCost)]);
  }

  let best: { cost: number; order: number[]; picks: Arrangement[] } | undefined;
  for (const order of orders) {
    let cost = segments[0] * first[order[0]].cost;
    for (let k = 1; k < g; k++) cost += segments[k] * later[order[k]].cost;
    if (best && cost >= best.cost - 1e-9) continue; // position changes only add cost

    // cheapest way through the equally good arrangements, minimising position changes
    let layer = first[order[0]].arrangements.map((arrangement) => ({ total: 0, picks: [arrangement] }));
    for (let k = 1; k < g; k++) {
      layer = later[order[k]].arrangements.map((arrangement) => {
        let pick = layer[0];
        let pickMoves = Infinity;
        for (const prev of layer) {
          const m = prev.total + moves(prev.picks[k - 1], arrangement);
          if (m < pickMoves) {
            pickMoves = m;
            pick = prev;
          }
        }
        return { total: pickMoves, picks: [...pick.picks, arrangement] };
      });
    }
    const end = layer.reduce((a, b) => (b.total < a.total ? b : a));
    const total = cost + MOVE_PENALTY * end.total;
    if (!best || total < best.cost - 1e-9) best = { cost: total, order, picks: end.picks };
  }

  const chosen = best!;
  const assignments = chosen.picks.map((arrangement) => {
    const onPitch: Record<string, Slot> = {};
    arrangement.slotIndexOf.forEach((slotIndex, m) => {
      if (slotIndex >= 0) onPitch[members[m].id] = slots[slotIndex];
    });
    return onPitch;
  });
  return { cost: chosen.cost, order: chosen.order.map((i) => members[i]), assignments };
}
