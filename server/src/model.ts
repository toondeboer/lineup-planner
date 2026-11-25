import type { MatchState } from '../../src/core/match';
import type { Player } from '../../src/core/types';

export interface TeamMeta {
  id: string;
  name: string;
  /** Secret code in the invite link. Readable by members so they can share it. */
  inviteCode: string;
  /** Bumped on every change, so a poll can tell in one cheap read whether anything changed. */
  version: number;
  createdAt: string;
}

export interface Member {
  id: string;
  displayName: string;
  joinedAt: string;
  lastSeenAt: string;
  /** SHA-256 of the member's token; the token itself is never stored. */
  tokenHash: string;
}

/** What a token resolves to. */
export interface TokenRecord {
  teamId: string;
  memberId: string;
  lastSeenAt: string;
}

export interface TeamData {
  meta: TeamMeta;
  members: Member[];
  players: Player[];
  match: MatchState;
}

/** The team no longer exists (deleted, or its last member left). */
export class TeamGoneError extends Error {
  constructor() {
    super('team_gone');
  }
}

/**
 * Storage for teams. Every method that changes a team bumps its version and returns the new one;
 * it throws `TeamGoneError` when the team does not exist.
 */
export interface Repo {
  createTeam(team: TeamData): Promise<void>;
  teamIdForInvite(code: string): Promise<string | undefined>;
  token(tokenHash: string): Promise<TokenRecord | undefined>;
  meta(teamId: string): Promise<TeamMeta | undefined>;
  team(teamId: string): Promise<TeamData | undefined>;
  addMember(teamId: string, member: Member): Promise<number>;
  /** Deletes the member and their token. */
  removeMember(teamId: string, member: Member): Promise<number>;
  /** Records that a member used the app; does not bump the version. */
  touch(teamId: string, member: { id: string; tokenHash: string }, at: string): Promise<void>;
  putPlayer(teamId: string, player: Player): Promise<number>;
  /** Deletes a player and sets the given match fields (the match without that player) in one write. */
  deletePlayer(teamId: string, playerId: string, matchFields: Partial<MatchState>): Promise<number>;
  patchMatch(teamId: string, fields: Partial<MatchState>): Promise<number>;
  rename(teamId: string, name: string): Promise<number>;
  resetInvite(teamId: string, oldCode: string, newCode: string): Promise<number>;
  /** Deletes every item of the team: meta, invite, members, tokens, players and match. */
  deleteTeam(team: TeamData): Promise<void>;
}
