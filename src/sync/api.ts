import type { InvitePreview, MatchState, Player, PollResult, TeamWithToken } from '../core';

/**
 * Base URL of the shared-teams API. Expo inlines it at build time, so it must be read exactly as
 * `process.env.EXPO_PUBLIC_API_URL` (no destructuring). Empty means sharing is not available.
 */
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');

/** Whether this build can share teams. Without an API URL the app is local-only and hides sharing. */
export const isCloudEnabled = () => API_URL !== '';

/**
 * A failed API call. `status` 0 means the server wasn't reached (`code` 'network' or 'timeout');
 * otherwise `code` is the server's error code, e.g. 'unauthorized' or 'invite_not_found'.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }

  /** The team or this device's membership is gone: removed, the team deleted, or the token lost. */
  get lostAccess() {
    return this.status === 401 || (this.status === 404 && this.code === 'team_not_found');
  }

  /** Worth trying again later: no connection, a timeout, or a server hiccup. */
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export interface ApiClient {
  createTeam(input: { name: string; displayName: string; squad: Player[]; match: MatchState }): Promise<TeamWithToken>;
  previewInvite(code: string): Promise<InvitePreview>;
  joinTeam(code: string, displayName: string): Promise<TeamWithToken>;
  /** Everything since `since`; pass 0 (or nothing) to always get the whole team. */
  getTeam(token: string, since?: number): Promise<PollResult>;
  putPlayer(token: string, player: Player): Promise<{ version: number }>;
  deletePlayer(token: string, playerId: string): Promise<{ version: number }>;
  patchMatch(token: string, fields: Partial<MatchState>): Promise<{ version: number }>;
  renameTeam(token: string, name: string): Promise<{ version: number }>;
  resetInvite(token: string): Promise<{ inviteCode: string; version: number }>;
  /** Removes a member; your own id to leave. The last member leaving deletes the team. */
  removeMember(token: string, memberId: string): Promise<{ version: number } | { deleted: true }>;
  deleteTeam(token: string, confirmName: string): Promise<{ deleted: true }>;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export function createApiClient(baseUrl: string, fetchFn: Fetch = (url, init) => fetch(url, init), timeoutMs = 10_000): ApiClient {
  async function request<T>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchFn(baseUrl + path, {
        method,
        headers: {
          ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text().catch(() => '');
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      // not JSON: e.g. a proxy's error page
    }
    if (!res.ok) {
      const code = (json as { error?: unknown } | undefined)?.error;
      throw new ApiError(res.status, typeof code === 'string' ? code : `http_${res.status}`);
    }
    return json as T;
  }

  const seg = encodeURIComponent;
  return {
    createTeam: (input) => request('POST', '/teams', { body: input }),
    previewInvite: (code) => request('GET', `/invites/${seg(code)}`),
    joinTeam: (code, displayName) => request('POST', `/invites/${seg(code)}/join`, { body: { displayName } }),
    getTeam: (token, since = 0) => request('GET', `/team?since=${since}`, { token }),
    putPlayer: (token, { id, ...player }) => request('PUT', `/players/${seg(id)}`, { token, body: player }),
    deletePlayer: (token, playerId) => request('DELETE', `/players/${seg(playerId)}`, { token }),
    patchMatch: (token, fields) => request('PATCH', '/match', { token, body: fields }),
    renameTeam: (token, name) => request('PATCH', '/team', { token, body: { name } }),
    resetInvite: (token) => request('POST', '/team/invite', { token }),
    removeMember: (token, memberId) => request('DELETE', `/members/${seg(memberId)}`, { token }),
    deleteTeam: (token, confirmName) => request('DELETE', '/team', { token, body: { confirmName } }),
  };
}

/** The client for this build's API. Check `isCloudEnabled()` before using it. */
export const api = createApiClient(API_URL);

/** The link coaches share. On the web it opens the join screen of the same site. */
export function inviteUrl(code: string, webOrigin: string | undefined): string {
  const path = `/join/${code}`;
  return webOrigin ? `${webOrigin.replace(/\/+$/, '')}${path}` : `lineup-planner:/${path}`;
}
