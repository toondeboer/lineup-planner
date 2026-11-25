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
export const PIN_VIOLATION = 1e14;

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

/** Weight of keeping a group's slots close together, per match minute. Only breaks ties. */
const COHESION_PER_MINUTE = 0.0001;

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
  const solution = options.strict || g > MAX_FLEXIBLE_GROUP
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
  const memo = strictMemo((1 << g) * (1 << p) * stride);
  const { cost: memoCost, pick: memoPick, next: memoNext, stamp } = memo;
  const generation = memo.generation;
  const index = (memberMask: number, slotMask: number, slotK: number) =>
    ((memberMask << p) | slotMask) * stride + slotK + 1;

  // Flat lookup tables for the hot loop, with the same arithmetic as pricing each step directly.
  // ownCost[(k * g + m) * p + s]: member m playing slot s until sitting out segment k (k >= 1),
  // including a broken pin. afterCost[same index]: member m playing slot s after segment k.
  const ownCost = new Float64Array(g * g * p);
  const afterCost = new Float64Array(g * g * p);
  for (let k = 0; k < g; k++) {
    for (let m = 0; m < g; m++) {
      for (let s = 0; s < p; s++) {
        const i = (k * g + m) * p + s;
        ownCost[i] = before[k] * pen[m][s] + (violates(pins, members[m], slots[s]) ? PIN_VIOLATION : 0);
        afterCost[i] = after[k] * pen[m][s];
      }
    }
  }
  // Pinned players start on the pitch, in their pinned slot.
  const benchStart = members.map((member) => (pins?.byPlayer.has(member.id) ? PIN_VIOLATION : 0));

  // Choose the member who sits out segment k, given the slot `slotK` they play before that.
  const solve = (k: number, memberMask: number, slotMask: number, slotK: number): number => {
    const key = index(memberMask, slotMask, slotK);
    if (stamp[key] === generation) return memoCost[key];
    let bestCost = Infinity;
    let bestPick = -1;
    let bestNext = -1;
    for (let m = 0; m < g; m++) {
      if (memberMask & (1 << m)) continue;
      const row = (k * g + m) * p;
      const own = k === 0 ? benchStart[m] : ownCost[row + slotK];
      if (k === g - 1) {
        if (own < bestCost) {
          bestCost = own;
          bestPick = m;
          bestNext = -1;
        }
        continue;
      }
      const nextMembers = memberMask | (1 << m);
      for (let t = 0; t < p; t++) {
        if (slotMask & (1 << t)) continue;
        const nextSlots = slotMask | (1 << t);
        const child = index(nextMembers, nextSlots, t);
        const rest = stamp[child] === generation ? memoCost[child] : solve(k + 1, nextMembers, nextSlots, t);
        const cost = own + afterCost[row + t] + rest;
        if (cost < bestCost) {
          bestCost = cost;
          bestPick = m;
          bestNext = t;
        }
      }
    }
    stamp[key] = generation;
    memoCost[key] = bestCost;
    memoPick[key] = bestPick;
    memoNext[key] = bestNext;
    return bestCost;
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

/**
 * Memo tables for `solveStrict`, reused between calls: the planner solves thousands of groups per
 * plan, and allocating fresh tables (~100 KB for a group of 6) each time was a large share of the run
 * time. An entry is valid only when
 * its stamp equals the current generation, so nothing needs clearing between calls.
 */
const memoTables = {
  cost: new Float64Array(0),
  pick: new Int8Array(0),
  next: new Int8Array(0),
  stamp: new Uint32Array(0),
  generation: 0,
};

function strictMemo(size: number): typeof memoTables {
  if (memoTables.cost.length < size) {
    memoTables.cost = new Float64Array(size);
    memoTables.pick = new Int8Array(size);
    memoTables.next = new Int8Array(size);
    memoTables.stamp = new Uint32Array(size);
    memoTables.generation = 0;
  }
  memoTables.generation++;
  if (memoTables.generation === 0xffffffff) {
    memoTables.stamp.fill(0);
    memoTables.generation = 1;
  }
  return memoTables;
}

/** Whether a group of this size is solved with like-for-like swaps only (see `SolveOptions.strict`). */
export function solvesStrictly(groupSize: number, strict: boolean | undefined): boolean {
  return Boolean(strict) || groupSize === 1 || groupSize > MAX_FLEXIBLE_GROUP;
}

/**
 * Whether `solveGroup` finds the optimum for a group of this size. Its cost then does not depend on
 * the order the members and slots are passed in. (Larger flexible groups only try a few sit-out orders.)
 */
export function solvesExactly(groupSize: number, strict: boolean | undefined): boolean {
  return solvesStrictly(groupSize, strict) || groupSize <= MAX_ORDER_SEARCH;
}

export function cohesionCost(slots: Slot[], matchMinutes: number): number {
  let total = 0;
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) total += pitchDistance(slots[i], slots[j]);
  }
  return COHESION_PER_MINUTE * matchMinutes * total;
}

/**
 * Cost of each teammate who has to change position at a substitution. Above everything at "OK" or
 * better (a whole match of those is at most 990), below a single minute at "emergency".
 */
const MOVE_PENALTY = 1000;

/** Largest group whose sit-out orders are all tried; bigger groups use a few sensible orders. */
const MAX_ORDER_SEARCH = 4;

/** Groups larger than this only make like-for-like swaps (the search space grows too fast). */
const MAX_FLEXIBLE_GROUP = 5;

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
 * Teammates may change position at a substitution, but only when that is worth it. For every
 * possible sitter we price every way of spreading the other members over the group's slots, then
 * choose the sit-out order and arrangements with the lowest total cost, where a position change
 * costs `MOVE_PENALTY`.
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
    cost: number;
    /** slotIndexOf[member] = slot index, or -1 for the sitter. */
    slotIndexOf: Int8Array;
  }

  const build = (sitter: number, withPins: boolean): Arrangement[] => {
    const others = members.map((_, i) => i).filter((i) => i !== sitter);
    return perms.map((perm) => {
      let cost = withPins && pins?.byPlayer.has(members[sitter].id) ? PIN_VIOLATION : 0;
      const slotIndexOf = new Int8Array(g).fill(-1);
      for (let i = 0; i < p; i++) {
        const member = others[i];
        cost += pen[member][perm[i]];
        if (withPins && violates(pins, members[member], slots[perm[i]])) cost += PIN_VIOLATION;
        slotIndexOf[member] = perm[i];
      }
      return { cost, slotIndexOf };
    });
  };

  const later = members.map((_, m) => build(m, false));
  const first = members.map((_, m) => build(m, true));
  const minCost = (list: Arrangement[]) => list.reduce((a, b) => Math.min(a, b.cost), Infinity);
  const laterMin = later.map(minCost);
  const firstMin = first.map(minCost);

  const moves = (a: Arrangement, b: Arrangement): number => {
    let count = 0;
    for (let m = 0; m < g; m++) {
      const x = a.slotIndexOf[m];
      const y = b.slotIndexOf[m];
      if (x >= 0 && y >= 0 && x !== y) count++;
    }
    return count;
  };

  const byLaterCost = (a: number, b: number) => laterMin[b] - laterMin[a] || a - b;
  let orders: number[][];
  if (g <= MAX_ORDER_SEARCH) {
    orders = permutations(g);
  } else {
    // One sensible order per possible first sitter (pins decide who may start on the bench).
    const cheapest = Math.min(...firstMin);
    orders = members
      .map((_, i) => i)
      .filter((i) => firstMin[i] <= cheapest)
      .map((i) => [i, ...members.map((_, j) => j).filter((j) => j !== i).sort(byLaterCost)]);
  }

  let best: { cost: number; order: number[]; picks: Arrangement[] } | undefined;
  for (const order of orders) {
    let lowerBound = segments[0] * firstMin[order[0]];
    for (let k = 1; k < g; k++) lowerBound += segments[k] * laterMin[order[k]];
    if (best && lowerBound >= best.cost) continue; // position changes only add cost

    // cheapest path through the segments: rating cost per segment plus a price for each position change
    let layer = first[order[0]].map((arrangement) => ({
      total: segments[0] * arrangement.cost,
      picks: [arrangement],
    }));
    for (let k = 1; k < g; k++) {
      layer = later[order[k]].map((arrangement) => {
        let pick = layer[0];
        let pickCost = Infinity;
        for (const prev of layer) {
          const c = prev.total + MOVE_PENALTY * moves(prev.picks[k - 1], arrangement);
          if (c < pickCost) {
            pickCost = c;
            pick = prev;
          }
        }
        return { total: pickCost + segments[k] * arrangement.cost, picks: [...pick.picks, arrangement] };
      });
    }
    const end = layer.reduce((a, b) => (b.total < a.total ? b : a));
    if (!best || end.total < best.cost) best = { cost: end.total, order, picks: end.picks };
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
