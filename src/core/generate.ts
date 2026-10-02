import { rating } from './fit';
import { planGoalkeepers } from './goalkeepers';
import { planGroupSizes, OUTFIELD_SLOTS, DEFAULT_MAX_GROUP_SIZE } from './groups';
import { MAX_SOLVABLE_GROUP, solveGroup, type GroupSolution } from './groupSolver';
import type { Plan, PlanGroup, PlanWarning, Substitution } from './plan';
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
}

/** Random restarts of the local search; large groups are expensive to evaluate, so use fewer. */
const restartsFor = (largestGroup: number) => (largestGroup >= 5 ? 6 : 24);

/**
 * Picks the goalkeeper(s): everyone rated 3 for GK (at most two), otherwise the best-rated
 * single player.
 */
export function chooseGoalkeepers(players: Player[]): string[] {
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

  const goalkeeperIds = input.goalkeeperIds ?? (players.length ? chooseGoalkeepers(players) : []);
  const goalkeepers = planGoalkeepers(goalkeeperIds, matchMinutes);
  for (const id of goalkeeperIds) {
    if (!players.some((p) => p.id === id)) throw new Error(`Unknown goalkeeper: ${id}`);
  }
  const outfield = players.filter((p) => !goalkeeperIds.includes(p.id));

  const sizing = planGroupSizes(outfield.length, { maxGroupSize });
  const memberCounts = [...sizing.groupSizes, ...Array<number>(sizing.fullTime).fill(1)];

  const solutions = optimise(outfield, outfieldSlots, memberCounts, matchMinutes);
  return buildPlan(input, matchMinutes, goalkeepers, goalkeeperIds, solutions);
}

// --- search ---------------------------------------------------------------------------------

interface GroupState {
  members: Player[];
  slots: Slot[];
}

function optimise(
  players: Player[],
  slots: Slot[],
  memberCounts: number[],
  matchMinutes: number,
): { state: GroupState; solution: GroupSolution }[] {
  const cache = new Map<string, GroupSolution>();
  const evaluate = (state: GroupState): GroupSolution => {
    const key =
      state.slots.map((s) => s.id).sort().join(',') + '|' + state.members.map((m) => m.id).sort().join(',');
    let hit = cache.get(key);
    if (!hit) {
      const segments = segmentLengths(state.members.length, matchMinutes);
      hit = solveGroup(state.members, state.slots, segments);
      cache.set(key, hit);
    }
    return hit;
  };

  const rand = mulberry32(1);
  let best: { states: GroupState[]; cost: number } | undefined;

  const restarts = restartsFor(Math.max(...memberCounts));
  for (let r = 0; r < restarts; r++) {
    // Slots in pitch order (attack to defence, left to right) for the first start, shuffled afterwards.
    const orderedSlots = [...slots].sort((a, b) => a.y - b.y || a.x - b.x);
    const slotPool = r === 0 ? orderedSlots : shuffle(slots, rand);
    const playerPool = shuffle(players, rand);
    const states: GroupState[] = [];
    let si = 0;
    let pi = 0;
    for (const count of memberCounts) {
      const slotCount = count === 1 ? 1 : count - 1;
      states.push({ slots: slotPool.slice(si, si + slotCount), members: playerPool.slice(pi, pi + count) });
      si += slotCount;
      pi += count;
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

  return best!.states.map((state) => ({ state, solution: evaluate(state) }));
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
    const { order, slotOrder } = solution;
    const g = order.length;
    const windows = g === 1 ? [] : groupWindows(g, matchMinutes);
    groups.push({
      id: `G${index + 1}`,
      slotIds: g === 1 ? [slotOrder[0].id] : slotOrder.map((s) => s.id),
      memberIds: order.map((p) => p.id),
      windows,
    });
    if (g === 1) {
      starting[slotOrder[0].id] = order[0].id;
      return;
    }
    startingBench.push(order[0].id);
    for (let k = 1; k < g; k++) starting[slotOrder[k - 1].id] = order[k].id;
    for (let k = 1; k < g; k++) {
      substitutions.push({
        minute: windows[k - 1],
        slotId: slotOrder[k - 1].id,
        offId: order[k].id,
        onId: order[k - 1].id,
      });
    }
  });

  if (goalkeepers.length === 2) {
    substitutions.push({
      minute: goalkeepers[1].from,
      slotId: gkSlotId,
      offId: goalkeepers[0].playerId,
      onId: goalkeepers[1].playerId,
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
    warnings: [],
  };
  plan.minutes = playingMinutes(plan, players);
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
