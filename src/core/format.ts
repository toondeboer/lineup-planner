import type { Plan } from './plan';
import type { Player } from './types';

export interface SubstitutionLine {
  minute: number;
  slotId: string;
  on: string;
  off: string;
}

/** Substitutions with names instead of ids, ordered by minute. */
export function substitutionLines(plan: Plan, players: Player[]): SubstitutionLine[] {
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  return plan.substitutions.map((s) => ({
    minute: s.minute,
    slotId: s.slotId,
    on: name(s.onId),
    off: name(s.offId),
  }));
}

/**
 * WhatsApp message with the substitutions and their minutes. Uses WhatsApp's *bold* markup.
 * The starting lineup goes along as an image.
 */
export function formatShareMessage(plan: Plan, players: Player[], formationName: string, title = 'Lineup'): string {
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const lines: string[] = [`⚽ *${title}* (${formationName})`];

  if (plan.substitutions.length === 0) {
    lines.push('', 'No substitutions.');
  } else {
    lines.push('', '*Substitutions*');
    let minute = -1;
    for (const sub of plan.substitutions) {
      if (sub.minute !== minute) {
        minute = sub.minute;
        lines.push(`${minute}'`);
      }
      lines.push(`• ${name(sub.onId)} on for ${name(sub.offId)} (${sub.slotId})`);
    }
  }

  if (plan.startingBench.length > 0) {
    lines.push('', `Bench at kick-off: ${plan.startingBench.map(name).join(', ')}`);
  }
  return lines.join('\n');
}
