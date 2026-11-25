import type { MatchState } from '../../src/core/match';
import type { Player } from '../../src/core/types';
import { TeamGoneError, type Member, type Repo, type TeamData, type TeamMeta, type TokenRecord } from './model';

/** In-memory `Repo` for tests and local development. Stores copies, as a database would. */
export class MemoryRepo implements Repo {
  private teams = new Map<string, TeamData>();
  private invites = new Map<string, string>();
  private tokens = new Map<string, TokenRecord>();

  async createTeam(team: TeamData) {
    this.teams.set(team.meta.id, structuredClone(team));
    this.invites.set(team.meta.inviteCode, team.meta.id);
    for (const m of team.members) {
      this.tokens.set(m.tokenHash, { teamId: team.meta.id, memberId: m.id, lastSeenAt: m.lastSeenAt });
    }
  }

  async teamIdForInvite(code: string) {
    return this.invites.get(code);
  }

  async token(tokenHash: string) {
    const t = this.tokens.get(tokenHash);
    return t && { ...t };
  }

  async meta(teamId: string): Promise<TeamMeta | undefined> {
    const t = this.teams.get(teamId);
    return t && { ...t.meta };
  }

  async team(teamId: string) {
    const t = this.teams.get(teamId);
    return t && structuredClone(t);
  }

  async addMember(teamId: string, member: Member) {
    return this.change(teamId, (t) => {
      t.members.push(structuredClone(member));
      this.tokens.set(member.tokenHash, { teamId, memberId: member.id, lastSeenAt: member.lastSeenAt });
    });
  }

  async removeMember(teamId: string, member: Member) {
    return this.change(teamId, (t) => {
      t.members = t.members.filter((m) => m.id !== member.id);
      this.tokens.delete(member.tokenHash);
    });
  }

  async touch(teamId: string, member: { id: string; tokenHash: string }, at: string) {
    const t = this.teams.get(teamId);
    const m = t?.members.find((x) => x.id === member.id);
    if (m) m.lastSeenAt = at;
    const token = this.tokens.get(member.tokenHash);
    if (token) token.lastSeenAt = at;
  }

  async putPlayer(teamId: string, player: Player) {
    return this.change(teamId, (t) => {
      const copy = structuredClone(player);
      const i = t.players.findIndex((p) => p.id === player.id);
      if (i >= 0) t.players[i] = copy;
      else t.players.push(copy);
    });
  }

  async deletePlayer(teamId: string, playerId: string, matchFields: Partial<MatchState>) {
    return this.change(teamId, (t) => {
      t.players = t.players.filter((p) => p.id !== playerId);
      t.match = { ...t.match, ...structuredClone(matchFields) };
    });
  }

  async patchMatch(teamId: string, fields: Partial<MatchState>) {
    return this.change(teamId, (t) => {
      t.match = { ...t.match, ...structuredClone(fields) };
    });
  }

  async rename(teamId: string, name: string) {
    return this.change(teamId, (t) => {
      t.meta.name = name;
    });
  }

  async resetInvite(teamId: string, oldCode: string, newCode: string) {
    return this.change(teamId, (t) => {
      this.invites.delete(oldCode);
      this.invites.set(newCode, teamId);
      t.meta.inviteCode = newCode;
    });
  }

  async deleteTeam(team: TeamData) {
    this.teams.delete(team.meta.id);
    this.invites.delete(team.meta.inviteCode);
    for (const m of team.members) this.tokens.delete(m.tokenHash);
  }

  private change(teamId: string, apply: (team: TeamData) => void): number {
    const t = this.teams.get(teamId);
    if (!t) throw new TeamGoneError();
    apply(t);
    t.meta.version += 1;
    return t.meta.version;
  }
}
