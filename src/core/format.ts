import type { Plan } from './plan';
import type { Player } from './types';

export interface SubstitutionLine {
  minute: number;
  slotId: string;
  on: string;
  off: string;
  /** Where the incoming player plays, when that is not the slot the other player leaves. */
  onSlotId?: string;
  /** Teammates who change position at the same moment. */
  moves: { name: string; toSlotId: string }[];
}

/** Substitutions with names instead of ids, ordered by minute. */
export function substitutionLines(plan: Plan, players: Player[]): SubstitutionLine[] {
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  return plan.substitutions.map((s) => ({
    minute: s.minute,
    slotId: s.slotId,
    on: name(s.onId),
    off: name(s.offId),
    onSlotId: s.onSlotId === s.slotId ? undefined : s.onSlotId,
    moves: s.moves.map((m) => ({ name: name(m.playerId), toSlotId: m.toSlotId })),
  }));
}

/**
 * WhatsApp message with the substitutions and their minutes. Uses WhatsApp's *bold* markup.
 * The starting lineup goes along as an image.
 */
export function formatShareMessage(plan: Plan, players: Player[], formationName: string, title = 'Lineup'): string {
  const lines: string[] = [`⚽ *${title}* (${formationName})`];

  if (plan.substitutions.length === 0) {
    lines.push('', 'No substitutions.');
  } else {
    lines.push('', '*Substitutions*');
    let minute = -1;
    for (const sub of substitutionLines(plan, players)) {
      if (sub.minute !== minute) {
        minute = sub.minute;
        lines.push(`${minute}'`);
      }
      const at = sub.onSlotId ? `, plays ${sub.onSlotId}` : '';
      lines.push(`• ${sub.on} on for ${sub.off} (${sub.slotId}${at})`);
      for (const move of sub.moves) lines.push(`   ↳ ${move.name} moves to ${move.toSlotId}`);
    }
  }

  if (plan.startingBench.length > 0) {
    const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;
    lines.push('', `Bench at kick-off: ${plan.startingBench.map(name).join(', ')}`);
  }
  return lines.join('\n');
}
