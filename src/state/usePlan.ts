import { useIsFocused } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { generatePlan, getFormation, type Formation, type Plan, type Player } from '../core';
import { availablePlayers, useStore, type MatchState } from './store';

export interface PlanResult {
  formation: Formation;
  players: Player[];
  plan?: Plan;
  error?: string;
}

export interface PlanState extends PlanResult {
  /** The plan shown is for older inputs (or missing) while the new one is being made. */
  pending: boolean;
}

interface Inputs {
  squad: Player[];
  match: MatchState;
}

/**
 * Plans by input. The store hands out the same `squad` and `match` objects until they change, so the
 * Plan tab and the Share screen share one computation, and switching screens never replans.
 */
const cache = new WeakMap<Player[], WeakMap<MatchState, PlanResult>>();

function cached({ squad, match }: Inputs): PlanResult | undefined {
  return cache.get(squad)?.get(match);
}

function planFor(inputs: Inputs): PlanResult {
  const hit = cached(inputs);
  if (hit) return hit;
  const { squad, match } = inputs;
  const formation = getFormation(match.formationId);
  const players = availablePlayers(squad, match);
  let result: PlanResult;
  try {
    const plan = generatePlan({
      formation,
      players,
      goalkeeperIds: match.goalkeeperIds.length ? match.goalkeeperIds : undefined,
      pinned: match.pinned,
      strictSwaps: match.strictSwaps,
      rotation: match.rotation,
      seed: match.seed ? match.seed : undefined,
    });
    result = { formation, players, plan };
  } catch (e) {
    result = { formation, players, error: e instanceof Error ? e.message : String(e) };
  }
  if (!cache.has(squad)) cache.set(squad, new WeakMap());
  cache.get(squad)!.set(match, result);
  return result;
}

/**
 * The current plan. Planning can take a noticeable moment on a phone, so:
 * - a screen that is not focused (the Plan tab while the Match tab is edited) keeps its last inputs
 *   instead of replanning on every tap;
 * - a new plan is made in a deferred render, so taps respond first; `pending` is true meanwhile.
 */
export function usePlan(): PlanState {
  const squad = useStore((s) => s.squad);
  const match = useStore((s) => s.match);
  const focused = useIsFocused();

  const [inputs, setInputs] = useState<Inputs>({ squad, match });
  if (focused && (inputs.squad !== squad || inputs.match !== match)) setInputs({ squad, match });

  const deferred = useDeferredValue<Inputs | undefined>(inputs, cached(inputs) ? inputs : undefined);
  if (!deferred) {
    return { formation: getFormation(inputs.match.formationId), players: availablePlayers(inputs.squad, inputs.match), pending: true };
  }
  return { ...planFor(deferred), pending: deferred !== inputs };
}
