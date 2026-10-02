import { useMemo } from 'react';
import { generatePlan, getFormation, type Formation, type Plan, type Player } from '../core';
import { availablePlayers, useStore } from './store';

export interface PlanResult {
  formation: Formation;
  players: Player[];
  plan?: Plan;
  error?: string;
}

/** The current plan, recalculated whenever the squad, availability, formation or overrides change. */
export function usePlan(): PlanResult {
  const squad = useStore((s) => s.squad);
  const match = useStore((s) => s.match);
  return useMemo(() => {
    const formation = getFormation(match.formationId);
    const players = availablePlayers(squad, match);
    try {
      const plan = generatePlan({
        formation,
        players,
        goalkeeperIds: match.goalkeeperIds.length ? match.goalkeeperIds : undefined,
        pinned: match.pinned,
        strictSwaps: match.strictSwaps,
        seed: match.seed ? match.seed : undefined,
      });
      return { formation, players, plan };
    } catch (e) {
      return { formation, players, error: e instanceof Error ? e.message : String(e) };
    }
  }, [squad, match]);
}
