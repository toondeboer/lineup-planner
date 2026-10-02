import { rating } from './fit';
import { planGoalkeepers } from './goalkeepers';
import { candidateSizings, fairnessCost, OUTFIELD_SLOTS, DEFAULT_MAX_GROUP_SIZE } from './groups';
import { MAX_SOLVABLE_GROUP, PIN_VIOLATION, makePins, solveGroup, type GroupSolution, type Pins } from './groupSolver';
import type { Plan, PlanGroup, PlanWarning, PositionChange, Substitution } from './plan';
import { lineupAt, slotGoalkeeper } from './plan';
import type { Formation, Player, Slot } from './types';
import { DEFAULT_MATCH_MINUTES, groupWindows, segmentBounds } from './windows';

export interface PlanInput {
  formation: Formation;
  /** Everyone available, goalkeepers included. */
  players: Player[];
  /** Explicit goalkeepers (one, or two who play a half each). Chosen automatically if omitted. */
  goalkeeperIds?: string[];
  matchMinutes?: number;
  maxGroupSize?: number;
  /**
   * Manual override: slot id -> player id who must start in that slot (partial or a full
   * starting 11). Groups and substitutions are planned around these players.
   */
  pinned?: Record<string, string>;
  /**
   * Only allow like-for-like swaps (the substitute takes exactly the position of the player going
   * off). By default teammates may shift position at a substitution so that fewer people end up
   * out of position.
   */
  strictSwaps?: boolean;
  /**
   * Varies the plan between equally good alternatives ("recalculate"). Never makes the plan worse:
   * the same players still play the same positions at the same rating level. Without a seed the plan is
   * the same every time.
   */
  seed?: number;
}

/** Random restarts of the local search; large groups are expensive to evaluate, so use fewer. */
const restartsFor = (largestGroup: number, base: number) => (largestGroup >= 5 ? Math.min(base, 6) : base);

const MAX_CANDIDATES = 8;

type Solved = { state: GroupState; solution: GroupSolution };

/**
 * Picks the goalkeeper(s): everyone rated 3 for GK (at most two), otherwise the best-rated
 * single player.
 */
export function chooseGoalkeepers(players: Player[]): string[] {
  if (players.length === 0) return [];
  const preferred = players.filter((p) => rating(p, 'GK') === 3);
  if (preferred.length > 0) return preferred.slice(0, 2).map((p) => p.id);
  let best = players[0];
  for (const p of players) if (rating(p, 'GK') > rating(best, 'GK')) best = p;
  return [best.id];
}

export function generatePlan(input: PlanInput): Plan {
  const matchMinutes = input.matchMinutes ?? DEFAULT_MATCH_MINUTES;
  const maxGroupSize = Math.min(input.maxGroupSize ?? DEFAULT_MAX_GROUP_SIZE, MAX_SOLVABLE_GROUP);
  const { formation, players } = input;
  const gkSlotId = slotGoalkeeper(formation);
  const outfieldSlots = formation.slots.filter((s) => s.id !== gkSlotId);
  if (outfieldSlots.length !== OUTFIELD_SLOTS) {
    throw new Error(`Formation ${formation.id} must have ${OUTFIELD_SLOTS} outfield slots`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new Error('Player ids must be unique');
  }

  const pinned = input.pinned ?? {};
  validatePins(pinned, formation, players);
  const pinnedOutfield = Object.fromEntries(Object.entries(pinned).filter(([slot]) => slot !== gkSlotId));
  const outfieldPinned = new Set(Object.values(pinnedOutfield));

  let goalkeeperIds =
    input.goalkeeperIds ?? chooseGoalkeepers(players.filter((p) => !outfieldPinned.has(p.id)));
  for (const id of goalkeeperIds) {
    if (!players.some((p) => p.id === id)) throw new Error(`Unknown goalkeeper: ${id}`);
    if (outfieldPinned.has(id)) throw new Error(`Goalkeeper ${id} cannot be pinned to an outfield slot`);
  }
  const pinnedKeeper = pinned[gkSlotId];
  if (pinnedKeeper !== undefined) {
    // The pinned keeper starts in goal; a second keeper (if any) takes over at half-time.
    goalkeeperIds = goalkeeperIds.includes(pinnedKeeper)
      ? [pinnedKeeper, ...goalkeeperIds.filter((id) => id !== pinnedKeeper)]
      : [pinnedKeeper];
  }
  const goalkeepers = planGoalkeepers(goalkeeperIds, matchMinutes);
  const outfield = players.filter((p) => !goalkeeperIds.includes(p.id));

  // Playing time stays between a half and three quarters of the match (groups of 2 to 4, nobody
  // full-time) whenever the squad size allows it, but every such split is tried because some of them
  // avoid putting someone in a position they cannot play. Small squads use the fairest few splits.
  const sizings = candidateSizings(outfield.length, { maxGroupSize });
  const standard = sizings.filter((s) => s.fullTime === 0 && Math.max(0, ...s.groupSizes) <= 4);
  const candidates = (standard.length > 0 ? standard : sizings.slice(0, 3)).slice(0, MAX_CANDIDATES);
  const pins = Object.keys(pinnedOutfield).length > 0 ? makePins(pinnedOutfield) : undefined;
  let best: { solved: Solved[]; total: number } | undefined;
  for (const sizing of candidates) {
    const memberCounts = [...sizing.groupSizes, ...Array<number>(sizing.fullTime).fill(1)];
    const result = optimise(outfield, outfieldSlots, memberCounts, matchMinutes, {
      pins,
      strict: input.strictSwaps ?? false,
      seed: input.seed,
      restarts: candidates.length > 1 ? 10 : 24,
    });
    const total = result.cost + fairnessCost(sizing, matchMinutes);
    if (!best || total < best.total - 1e-9) best = { solved: result.solved, total };
  }
  const solutions = best!.solved;
  return buildPlan(input, matchMinutes, goalkeepers, goalkeeperIds, solutions);
}

// --- search ---------------------------------------------------------------------------------

interface GroupState {
  members: Player[];
  slots: Slot[];
}

function validatePins(pinned: Record<string, string>, formation: Formation, players: Player[]): void {
  const seen = new Set<string>();
  for (const [slotId, playerId] of Object.entries(pinned)) {
    if (!formation.slots.some((s) => s.id === slotId)) throw new Error(`Unknown slot in pins: ${slotId}`);
    if (!players.some((p) => p.id === playerId)) throw new Error(`Unknown player in pins: ${playerId}`);
    if (seen.has(playerId)) throw new Error(`Player ${playerId} is pinned to more than one slot`);
    seen.add(playerId);
  }
}

function optimise(
  players: Player[],
  slots: Slot[],
  memberCounts: number[],
  matchMinutes: number,
  { pins, strict, seed, restarts: baseRestarts }: { pins?: Pins; strict: boolean; seed?: number; restarts: number },
): { solved: Solved[]; cost: number } {
  const cache = new Map<string, GroupSolution>();
  const jitter = seed === undefined ? undefined : (playerId: string, slotId: string) => JITTER * hash01(seed, playerId, slotId);
  const evaluate = (state: GroupState): GroupSolution => {
    const key =
      state.slots.map((s) => s.id).sort().join(',') + '|' + state.members.map((m) => m.id).sort().join(',');
    let hit = cache.get(key);
    if (!hit) {
      const segments = segmentLengths(state.members.length, matchMinutes);
      hit = solveGroup(state.members, state.slots, segments, { pins, strict, jitter });
      cache.set(key, hit);
    }
    return hit;
  };

  const rand = mulberry32(seed === undefined ? 1 : 1000 + seed);
  let best: { states: GroupState[]; cost: number } | undefined;

  const restarts = restartsFor(Math.max(...memberCounts), baseRestarts);
  for (let r = 0; r < restarts; r++) {
    // Slots in pitch order (attack to defence, left to right) for the first start, shuffled afterwards.
    const orderedSlots = [...slots].sort((a, b) => a.y - b.y || a.x - b.x);
    const slotPool = r === 0 ? orderedSlots : shuffle(slots, rand);
    // Pinned players start in the same group as their slot; everyone else fills the gaps.
    const playerById = new Map(players.map((p) => [p.id, p]));
    const free = shuffle(
      players.filter((p) => !pins?.byPlayer.has(p.id)),
      rand,
    );
    const states: GroupState[] = [];
    let si = 0;
    for (const count of memberCounts) {
      const slotCount = count === 1 ? 1 : count - 1;
      const groupSlots = slotPool.slice(si, si + slotCount);
      si += slotCount;
      const members = groupSlots.flatMap((s) => {
        const id = pins?.bySlot.get(s.id);
        return id === undefined ? [] : [playerById.get(id)!];
      });
      while (members.length < count) members.push(free.pop()!);
      states.push({ slots: groupSlots, members });
    }
    const costs = states.map((s) => evaluate(s).cost);
    let total = costs.reduce((a, b) => a + b, 0);

    let improved = true;
    while (improved) {
      improved = false;
      for (let a = 0; a < states.length; a++) {
        for (let b = a + 1; b < states.length; b++) {
          const moves: ((x: GroupState, y: GroupState, i: number, j: number) => [GroupState, GroupState])[] = [
            swapMembers,
            swapSlots,
          ];
          if (pins) {
            // A pinned slot only moves together with its pinned player.
            const tryMove = (na: GroupState, nb: GroupState) => {
              const ca = evaluate(na).cost;
              const cb = evaluate(nb).cost;
              if (ca + cb < costs[a] + costs[b] - 1e-9) {
                total += ca + cb - costs[a] - costs[b];
                states[a] = na;
                states[b] = nb;
                costs[a] = ca;
                costs[b] = cb;
                improved = true;
              }
            };
            for (let i = 0; i < states[a].slots.length; i++) {
              for (let j = 0; j < states[b].slots.length; j++) {
                const pinnedA = pins.bySlot.get(states[a].slots[i].id);
                const pinnedB = pins.bySlot.get(states[b].slots[j].id);
                if (pinnedA === undefined && pinnedB === undefined) continue;
                const us = pinnedA === undefined ? states[a].members.map((_, u) => u) : [states[a].members.findIndex((m) => m.id === pinnedA)];
                const vs = pinnedB === undefined ? states[b].members.map((_, v) => v) : [states[b].members.findIndex((m) => m.id === pinnedB)];
                for (const u of us) {
                  for (const v of vs) {
                    if (u < 0 || v < 0) continue;
                    const [sa, sb] = swapSlots(states[a], states[b], i, j);
                    const [na, nb] = swapMembers(sa, sb, u, v);
                    tryMove(na, nb);
                  }
                }
              }
            }
          }
          moves.forEach((move, moveIndex) => {
            const sizeA = moveIndex === 0 ? states[a].members.length : states[a].slots.length;
            const sizeB = moveIndex === 0 ? states[b].members.length : states[b].slots.length;
            for (let i = 0; i < sizeA; i++) {
              for (let j = 0; j < sizeB; j++) {
                const [na, nb] = move(states[a], states[b], i, j);
                const ca = evaluate(na).cost;
                const cb = evaluate(nb).cost;
                if (ca + cb < costs[a] + costs[b] - 1e-9) {
                  total += ca + cb - costs[a] - costs[b];
                  states[a] = na;
                  states[b] = nb;
                  costs[a] = ca;
                  costs[b] = cb;
                  improved = true;
                }
              }
            }
          });
        }
      }
    }
    if (!best || total < best.cost - 1e-9) best = { states: states.map((s) => ({ ...s })), cost: total };
  }

  if (best!.cost >= PIN_VIOLATION) throw new Error('Could not plan around the pinned starters');
  return { solved: best!.states.map((state) => ({ state, solution: evaluate(state) })), cost: best!.cost };
}

function swapMembers(a: GroupState, b: GroupState, i: number, j: number): [GroupState, GroupState] {
  const ma = [...a.members];
  const mb = [...b.members];
  [ma[i], mb[j]] = [mb[j], ma[i]];
  return [{ ...a, members: ma }, { ...b, members: mb }];
}

function swapSlots(a: GroupState, b: GroupState, i: number, j: number): [GroupState, GroupState] {
  const sa = [...a.slots];
  const sb = [...b.slots];
  [sa[i], sb[j]] = [sb[j], sa[i]];
  return [{ ...a, slots: sa }, { ...b, slots: sb }];
}

function segmentLengths(groupSize: number, matchMinutes: number): number[] {
  if (groupSize === 1) return [matchMinutes];
  const bounds = segmentBounds(groupSize, matchMinutes);
  return bounds.slice(1).map((end, i) => end - bounds[i]);
}

/** Per-minute noise added to ratings when a seed is given; far below the gap between rating levels. */
const JITTER = 0.9;

function hash01(seed: number, a: string, b: string): number {
  let h = 2166136261 ^ seed;
  for (const ch of `${a}|${b}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// --- plan assembly ------------------------------------------------------------------------

function buildPlan(
  input: PlanInput,
  matchMinutes: number,
  goalkeepers: Plan['goalkeepers'],
  goalkeeperIds: string[],
  solved: { state: GroupState; solution: GroupSolution }[],
): Plan {
  const { formation, players } = input;
  const gkSlotId = slotGoalkeeper(formation);
  const starting: Record<string, string> = { [gkSlotId]: goalkeepers[0].playerId };
  const startingBench: string[] = goalkeepers.slice(1).map((s) => s.playerId);
  const substitutions: Substitution[] = [];
  const groups: PlanGroup[] = [];

  // Stable group order: top-left of the pitch first.
  const sorted = [...solved].sort((a, b) => firstSlotKey(a.state.slots) - firstSlotKey(b.state.slots));
  sorted.forEach(({ solution }, index) => {
    const { order, assignments } = solution;
    const g = order.length;
    const windows = g === 1 ? [] : groupWindows(g, matchMinutes);
    const slotIds = [...new Set(assignments.flatMap((a) => Object.values(a).map((slot) => slot.id)))];
    groups.push({ id: `G${index + 1}`, slotIds, memberIds: order.map((p) => p.id), windows });
    for (const [playerId, slot] of Object.entries(assignments[0])) starting[slot.id] = playerId;
    if (g === 1) return;
    startingBench.push(order[0].id);
    for (let k = 1; k < g; k++) {
      const before = assignments[k - 1];
      const after = assignments[k];
      const on = order[k - 1];
      const off = order[k];
      const moves: PositionChange[] = [];
      for (const [playerId, slot] of Object.entries(after)) {
        if (playerId !== on.id && before[playerId] && before[playerId].id !== slot.id) {
          moves.push({ playerId, fromSlotId: before[playerId].id, toSlotId: slot.id });
        }
      }
      substitutions.push({
        minute: windows[k - 1],
        slotId: before[off.id].id,
        offId: off.id,
        onId: on.id,
        onSlotId: after[on.id].id,
        moves,
      });
    }
  });

  if (goalkeepers.length === 2) {
    substitutions.push({
      minute: goalkeepers[1].from,
      slotId: gkSlotId,
      offId: goalkeepers[0].playerId,
      onId: goalkeepers[1].playerId,
      onSlotId: gkSlotId,
      moves: [],
    });
  }
  const slotIndex = new Map(formation.slots.map((s, i) => [s.id, i]));
  substitutions.sort((a, b) => a.minute - b.minute || slotIndex.get(a.slotId)! - slotIndex.get(b.slotId)!);

  const plan: Plan = {
    formationId: formation.id,
    matchMinutes,
    goalkeepers,
    groups,
    starting,
    startingBench,
    substitutions,
    minutes: {},
    fit: { preferred: 0, ok: 0, emergency: 0, unsuited: 0 },
    warnings: [],
  };
  plan.minutes = playingMinutes(plan, players);
  plan.fit = fitMinutes(plan, formation, players);
  plan.warnings = findWarnings(plan, formation, players, goalkeeperIds);
  return plan;
}

function firstSlotKey(slots: Slot[]): number {
  const first = [...slots].sort((a, b) => a.y - b.y || a.x - b.x)[0];
  return first.y * 1000 + first.x;
}

function boundaries(plan: Plan): number[] {
  return [...new Set([0, ...plan.substitutions.map((s) => s.minute), plan.matchMinutes])].sort((a, b) => a - b);
}

function playingMinutes(plan: Plan, players: Player[]): Record<string, number> {
  const minutes: Record<string, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
  const bounds = boundaries(plan);
  bounds.slice(0, -1).forEach((from, i) => {
    const lineup = lineupAt(plan, from);
    for (const id of Object.values(lineup)) minutes[id] += bounds[i + 1] - from;
  });
  return minutes;
}

function findWarnings(plan: Plan, formation: Formation, players: Player[], goalkeeperIds: string[]): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const roleOf = new Map(formation.slots.map((s) => [s.id, s.role]));
  const bounds = boundaries(plan);
  const open = new Map<string, PlanWarning>();
  bounds.slice(0, -1).forEach((from, i) => {
    const lineup = lineupAt(plan, from);
    const seen = new Set<string>();
    for (const [slotId, playerId] of Object.entries(lineup)) {
      const key = `${slotId}|${playerId}`;
      seen.add(key);
      if (rating(byId.get(playerId)!, roleOf.get(slotId)!) === 0) {
        const existing = open.get(key);
        if (existing) existing.to = bounds[i + 1];
        else {
          const w: PlanWarning = { type: 'unsuited-position', playerId, slotId, from, to: bounds[i + 1] };
          open.set(key, w);
          warnings.push(w);
        }
      }
    }
    for (const key of open.keys()) if (!seen.has(key)) open.delete(key);
  });
  for (const id of goalkeeperIds) {
    if (rating(byId.get(id)!, 'GK') === 0) warnings.push({ type: 'no-goalkeeper-rating', playerId: id });
  }
  return warnings;
}

const FIT_NAMES = ['unsuited', 'emergency', 'ok', 'preferred'] as const;

function fitMinutes(plan: Plan, formation: Formation, players: Player[]): Plan['fit'] {
  const fit = { preferred: 0, ok: 0, emergency: 0, unsuited: 0 };
  const byId = new Map(players.map((p) => [p.id, p]));
  const roleOf = new Map(formation.slots.map((s) => [s.id, s.role]));
  const bounds = boundaries(plan);
  bounds.slice(0, -1).forEach((from, i) => {
    for (const [slotId, playerId] of Object.entries(lineupAt(plan, from))) {
      fit[FIT_NAMES[rating(byId.get(playerId)!, roleOf.get(slotId)!)]] += bounds[i + 1] - from;
    }
  });
  return fit;
}
