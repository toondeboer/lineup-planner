import { Platform } from 'react-native';
import type { MemberView } from '../core';
import { useStore } from '../state/store';
import { api, ApiError, inviteUrl } from './api';
import { toLink } from './helpers';

/** Team actions: each calls the API and updates the store. Errors are thrown as `ApiError`. */

/** Shares this device's squad and match as a new team. */
export async function createTeam(name: string, displayName: string) {
  const { squad, match, connectTeam } = useStore.getState();
  const result = await api.createTeam({ name, displayName, squad, match });
  connectTeam(toLink(result), result.team.players, result.team.match);
}

/** Joins a team; its squad and match replace the ones on this device. */
export async function joinTeam(code: string, displayName: string) {
  const result = await api.joinTeam(code, displayName);
  useStore.getState().connectTeam(toLink(result), result.team.players, result.team.match);
}

/** The team's members, newest data from the server. */
export async function loadMembers(): Promise<MemberView[]> {
  const { team } = useStore.getState();
  if (!team) return [];
  const result = await withAccessCheck(() => api.getTeam(team.token, 0));
  return 'team' in result ? result.team.members : [];
}

export async function resetInvite() {
  const team = requireTeam();
  const { inviteCode } = await withAccessCheck(() => api.resetInvite(team.token));
  useStore.getState().updateTeam({ inviteCode });
}

export async function removeMember(memberId: string) {
  const team = requireTeam();
  await withAccessCheck(() => api.removeMember(team.token, memberId));
}

/** Leaves the team. The squad and match stay on this device as a local copy. */
export async function leaveTeam() {
  const team = requireTeam();
  try {
    await api.removeMember(team.token, team.memberId);
  } catch (e) {
    // already out of the team: leaving locally is all that's left to do
    if (!(e instanceof ApiError && e.lostAccess)) throw e;
  }
  useStore.getState().disconnectTeam();
}

export async function deleteTeamForEveryone(confirmName: string) {
  const team = requireTeam();
  await withAccessCheck(() => api.deleteTeam(team.token, confirmName));
  useStore.getState().disconnectTeam();
}

/** The link to share, for the current build: this site on the web, the configured site in the apps. */
export function currentInviteUrl(code: string) {
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : process.env.EXPO_PUBLIC_WEB_URL;
  return inviteUrl(code, origin);
}

/** A readable message for a failed team action. */
export function errorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Something went wrong. Try again.';
  if (e.status === 0) return "Couldn't reach the server. Check your connection and try again.";
  if (e.lostAccess) return "You're no longer in this team. The squad stays on this device.";
  switch (e.code) {
    case 'invite_not_found':
      return "This invite link doesn't work any more. Ask a coach for a new one.";
    case 'confirm_name_mismatch':
      return "That's not the team's name.";
    case 'member_not_found':
      return 'That coach has already left the team.';
    default:
      return e.status >= 500 ? 'The server had a problem. Try again in a moment.' : `Something went wrong (${e.code}).`;
  }
}

function requireTeam() {
  const { team } = useStore.getState();
  if (!team) throw new ApiError(401, 'unauthorized');
  return team;
}

/** Runs a call; if this device turns out to be out of the team, goes back to local-only. */
async function withAccessCheck<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (e instanceof ApiError && e.lostAccess) useStore.getState().disconnectTeam();
    throw e;
  }
}
