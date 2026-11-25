import type { TeamWithToken } from '../core';
import type { TeamLink } from '../state/persisted';

/** This device's membership, from the answer to creating or joining a team. */
export function toLink({ team, token }: TeamWithToken): TeamLink {
  return { id: team.id, name: team.name, inviteCode: team.inviteCode, token, memberId: team.you, version: team.version };
}

/** The invite code in a pasted link or code, or undefined. */
export function parseInviteCode(text: string): string | undefined {
  return text.trim().toLowerCase().match(/(?:^|[^0-9a-f])([0-9a-f]{32})(?:$|[^0-9a-f])/)?.[1];
}

/** "today", "yesterday", "3 days ago", or a date for anything older than a week. */
export function formatSeen(iso: string, now: Date = new Date()): string {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(now) - day(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
