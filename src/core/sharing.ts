import type { MatchState } from './match';
import type { Player } from './types';

/** The shared-teams API contract, used by the app (src/sync) and the server (server/src). */

/** What members see of each other. */
export interface MemberView {
  id: string;
  displayName: string;
  joinedAt: string;
  lastSeenAt: string;
}

export interface TeamView {
  id: string;
  name: string;
  /** Secret code in the invite link. */
  inviteCode: string;
  /** Bumped on every change to the team. */
  version: number;
  /** The caller's member id. */
  you: string;
  members: MemberView[];
  players: Player[];
  match: MatchState;
}

/** Answer to creating or joining a team: the team and this device's member token. */
export interface TeamWithToken {
  team: TeamView;
  token: string;
}

/** Answer to a poll: unchanged since the version the app has, or the whole team. */
export type PollResult = { unchanged: true; version: number } | { team: TeamView };

export interface InvitePreview {
  teamName: string;
  playerCount: number;
  memberCount: number;
}
