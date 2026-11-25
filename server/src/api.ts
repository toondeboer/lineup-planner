import { withoutPlayer, type MatchState } from '../../src/core/match';
import type { TeamView } from '../../src/core/sharing';
import { bearerToken, hashToken, isInviteCode, newId, newInviteCode, newToken } from './auth';
import { TeamGoneError, type Member, type Repo, type TeamData } from './model';
import * as v from './validate';

export interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  /** Header names in lower case. */
  headers: Record<string, string | undefined>;
  body?: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface Deps {
  repo: Repo;
  now: () => Date;
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

/** A member's last-seen time is written at most this often. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

interface Caller {
  teamId: string;
  memberId: string;
  tokenHash: string;
  lastSeenAt: string;
}

interface Ctx {
  req: ApiRequest;
  deps: Deps;
  params: string[];
  body: () => Record<string, unknown>;
  /** The authenticated member; only set on routes that need a token. */
  caller: Caller;
}

type Handler = (ctx: Ctx) => Promise<ApiResponse>;

const ok = (body: unknown, status = 200): ApiResponse => ({ status, body });

const PUBLIC = false;
const MEMBERS = true;

const routes: [method: string, path: RegExp, needsToken: boolean, handler: Handler][] = [
  ['POST', /^\/teams$/, PUBLIC, createTeam],
  ['GET', /^\/invites\/([^/]+)$/, PUBLIC, previewInvite],
  ['POST', /^\/invites\/([^/]+)\/join$/, PUBLIC, joinTeam],
  ['GET', /^\/team$/, MEMBERS, getTeam],
  ['PATCH', /^\/team$/, MEMBERS, renameTeam],
  ['DELETE', /^\/team$/, MEMBERS, deleteTeam],
  ['POST', /^\/team\/invite$/, MEMBERS, resetInvite],
  ['PUT', /^\/players\/([^/]+)$/, MEMBERS, putPlayer],
  ['DELETE', /^\/players\/([^/]+)$/, MEMBERS, deletePlayer],
  ['PATCH', /^\/match$/, MEMBERS, patchMatch],
  ['DELETE', /^\/members\/([^/]+)$/, MEMBERS, removeMember],
];

/** Handles one API request. Never throws: errors become `{ error: <code> }` responses. */
export async function handle(req: ApiRequest, deps: Deps): Promise<ApiResponse> {
  try {
    if (req.method === 'OPTIONS') return ok(null, 204);
    const route = findRoute(req);
    // authenticate before looking at the body, so strangers learn nothing about the request format
    const caller = route.needsToken ? await authenticate(req, deps.repo) : NO_CALLER;
    let parsed: Record<string, unknown> | undefined;
    return await route.handler({
      req,
      deps,
      params: route.params,
      body: () => (parsed ??= parseBody(req.body)),
      caller,
    });
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.code } };
    if (e instanceof v.InvalidError) return { status: 400, body: { error: e.message } };
    if (e instanceof TeamGoneError) return { status: 404, body: { error: 'team_not_found' } };
    // log the kind of failure only: messages could contain request data
    console.error('unexpected error', e instanceof Error ? e.name : typeof e);
    return { status: 500, body: { error: 'internal' } };
  }
}

const NO_CALLER: Caller = { teamId: '', memberId: '', tokenHash: '', lastSeenAt: '' };

function findRoute(req: ApiRequest): { handler: Handler; needsToken: boolean; params: string[] } {
  let pathMatched = false;
  for (const [method, pattern, needsToken, handler] of routes) {
    const m = req.path.match(pattern);
    if (!m) continue;
    pathMatched = true;
    if (method === req.method) return { handler, needsToken, params: m.slice(1).map(decodeParam) };
  }
  throw pathMatched ? new HttpError(405, 'method_not_allowed') : new HttpError(404, 'not_found');
}

function decodeParam(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    throw new HttpError(404, 'not_found');
  }
}

function parseBody(body: string | undefined): Record<string, unknown> {
  if (!body) return {};
  if (Buffer.byteLength(body) > v.LIMITS.bodyBytes) throw new HttpError(413, 'body_too_large');
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
  return v.object(json);
}

/** The caller's team comes from their token only, never from the request. */
async function authenticate(req: ApiRequest, repo: Repo): Promise<Caller> {
  const token = bearerToken(req.headers.authorization);
  if (!token) throw new HttpError(401, 'unauthorized');
  const tokenHash = hashToken(token);
  const record = await repo.token(tokenHash);
  if (!record) throw new HttpError(401, 'unauthorized');
  return { ...record, tokenHash };
}

function newMember(displayName: string, at: string): { member: Member; token: string } {
  const token = newToken();
  return {
    token,
    member: { id: newId(), displayName, joinedAt: at, lastSeenAt: at, tokenHash: hashToken(token) },
  };
}

async function loadTeam(repo: Repo, teamId: string): Promise<TeamData> {
  const team = await repo.team(teamId);
  if (!team) throw new TeamGoneError();
  return team;
}

function view(team: TeamData, you: string): TeamView {
  return {
    id: team.meta.id,
    name: team.meta.name,
    inviteCode: team.meta.inviteCode,
    version: team.meta.version,
    you,
    members: team.members.map(({ id, displayName, joinedAt, lastSeenAt }) => ({ id, displayName, joinedAt, lastSeenAt })),
    players: team.players,
    match: team.match,
  };
}

async function inviteTeamId(repo: Repo, code: string): Promise<string> {
  const teamId = isInviteCode(code) ? await repo.teamIdForInvite(code) : undefined;
  if (!teamId) throw new HttpError(404, 'invite_not_found');
  return teamId;
}

// --- routes ---

async function createTeam({ body, deps }: Ctx) {
  const b = body();
  const name = v.text(b.name, 'name', v.LIMITS.teamName);
  const displayName = v.text(b.displayName, 'displayName', v.LIMITS.displayName);
  const players = b.squad === undefined ? [] : v.squad(b.squad);
  const match = v.match(b.match);
  const at = deps.now().toISOString();
  const { member, token } = newMember(displayName, at);
  const team: TeamData = {
    meta: { id: newId(), name, inviteCode: newInviteCode(), version: 1, createdAt: at },
    members: [member],
    players,
    match,
  };
  await deps.repo.createTeam(team);
  return ok({ team: view(team, member.id), token }, 201);
}

async function previewInvite({ deps, params: [code] }: Ctx) {
  const team = await loadTeam(deps.repo, await inviteTeamId(deps.repo, code));
  return ok({ teamName: team.meta.name, playerCount: team.players.length, memberCount: team.members.length });
}

async function joinTeam({ body, deps, params: [code] }: Ctx) {
  const displayName = v.text(body().displayName, 'displayName', v.LIMITS.displayName);
  const teamId = await inviteTeamId(deps.repo, code);
  const { member, token } = newMember(displayName, deps.now().toISOString());
  await deps.repo.addMember(teamId, member);
  return ok({ team: view(await loadTeam(deps.repo, teamId), member.id), token }, 201);
}

async function getTeam({ req, deps, caller }: Ctx) {
  const c = caller;
  const now = deps.now();
  if (now.getTime() - Date.parse(c.lastSeenAt) >= TOUCH_INTERVAL_MS) {
    await deps.repo.touch(c.teamId, { id: c.memberId, tokenHash: c.tokenHash }, now.toISOString());
  }
  const since = Number(req.query.since);
  const meta = await deps.repo.meta(c.teamId);
  if (!meta) throw new TeamGoneError();
  if (meta.version === since) return ok({ unchanged: true, version: meta.version });
  return ok({ team: view(await loadTeam(deps.repo, c.teamId), c.memberId) });
}

async function renameTeam({ body, deps, caller }: Ctx) {
  const name = v.text(body().name, 'name', v.LIMITS.teamName);
  return ok({ version: await deps.repo.rename(caller.teamId, name) });
}

async function deleteTeam({ body, deps, caller }: Ctx) {
  const confirmName = v.text(body().confirmName, 'confirmName', v.LIMITS.teamName);
  const team = await loadTeam(deps.repo, caller.teamId);
  if (confirmName.toLocaleLowerCase() !== team.meta.name.toLocaleLowerCase()) {
    throw new HttpError(400, 'confirm_name_mismatch');
  }
  await deps.repo.deleteTeam(team);
  return ok({ deleted: true });
}

async function resetInvite({ deps, caller }: Ctx) {
  const { teamId } = caller;
  const meta = await deps.repo.meta(teamId);
  if (!meta) throw new TeamGoneError();
  const inviteCode = newInviteCode();
  const version = await deps.repo.resetInvite(teamId, meta.inviteCode, inviteCode);
  return ok({ inviteCode, version });
}

async function putPlayer({ body, deps, caller, params: [playerId] }: Ctx) {
  const p = v.player({ ...body(), id: v.id(playerId) });
  return ok({ version: await deps.repo.putPlayer(caller.teamId, p) });
}

async function deletePlayer({ deps, caller, params: [playerId] }: Ctx) {
  const id = v.id(playerId);
  const { teamId } = caller;
  const { match } = await loadTeam(deps.repo, teamId);
  const after = withoutPlayer(match, id);
  const changed = Object.fromEntries(
    (['availableIds', 'guests', 'goalkeeperIds', 'pinned'] as const)
      .filter((k) => JSON.stringify(after[k]) !== JSON.stringify(match[k]))
      .map((k) => [k, after[k]]),
  ) as Partial<MatchState>;
  return ok({ version: await deps.repo.deletePlayer(teamId, id, changed) });
}

async function patchMatch({ body, deps, caller }: Ctx) {
  const fields = v.matchFields(body());
  return ok({ version: await deps.repo.patchMatch(caller.teamId, fields) });
}

async function removeMember({ deps, caller, params: [memberId] }: Ctx) {
  const team = await loadTeam(deps.repo, caller.teamId);
  const member = team.members.find((m) => m.id === memberId);
  if (!member) throw new HttpError(404, 'member_not_found');
  if (team.members.length === 1) {
    // the last member leaving deletes the team and everything in it
    await deps.repo.deleteTeam(team);
    return ok({ deleted: true });
  }
  return ok({ version: await deps.repo.removeMember(team.meta.id, member) });
}
