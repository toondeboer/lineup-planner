import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { MemberView } from '../core';
import { copyText, shareText } from '../share/share';
import { useStore } from '../state/store';
import { isCloudEnabled } from '../sync/api';
import { formatSeen, parseInviteCode } from '../sync/helpers';
import {
  createTeam,
  currentInviteUrl,
  deleteTeamForEveryone,
  errorMessage,
  leaveTeam,
  loadMembers,
  removeMember,
  resetInvite,
} from '../sync/teams';
import { Button, Card, ConfirmButton, Heading, Muted, Notice, Row, Screen, TextField } from '../ui/components';
import { colors } from '../ui/theme';

/** Back to where the coach came from, or to the squad when the screen was opened directly. */
const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

const PRIVACY = 'Anyone with the link can see and edit the squad, including the ratings. Share it with coaches only.';

export default function TeamScreen() {
  const team = useStore((s) => s.team);
  if (!isCloudEnabled()) {
    return (
      <Screen>
        <Muted>Sharing a team isn't available in this version of the app.</Muted>
      </Screen>
    );
  }
  return team ? <SharedTeam /> : <StartSharing />;
}

/** Not in a team yet: share this squad as a new team, or join one with a link. */
function StartSharing() {
  const players = useStore((s) => s.squad.length);
  const [teamName, setTeamName] = useState('');
  const [yourName, setYourName] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      await createTeam(teamName.trim(), yourName.trim());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const code = parseInviteCode(invite);

  return (
    <Screen>
      <Card>
        <Heading>Share this squad with your coaches</Heading>
        <Muted>
          {`Your ${players} player${players === 1 ? '' : 's'} and the match setup go to a shared team. You get a link to send to the other coaches; everyone who opens it can edit the squad and make line-ups.`}
        </Muted>
        <TextField label="Team name, e.g. JO17-1" value={teamName} onChangeText={setTeamName} maxLength={60} />
        <TextField label="Your name" value={yourName} onChangeText={setYourName} maxLength={40} autoComplete="name" />
        <Muted>{PRIVACY}</Muted>
        <Button label="Privacy: what is shared" kind="secondary" onPress={() => router.push('/privacy')} />
        <Button
          label={busy ? 'Creating…' : 'Create shared team'}
          onPress={create}
          disabled={busy || !teamName.trim() || !yourName.trim()}
        />
        {error ? <Notice error>{error}</Notice> : null}
      </Card>
      <Card>
        <Heading>Got an invite link?</Heading>
        <Muted>Open it on this phone, or paste it here.</Muted>
        <TextField label="Invite link or code" value={invite} onChangeText={setInvite} autoCapitalize="none" autoCorrect={false} />
        <Button label="Continue" kind="secondary" disabled={!code} onPress={() => code && router.push(`/join/${code}`)} />
      </Card>
    </Screen>
  );
}

/** In a team: invite link, members, and leaving. */
function SharedTeam() {
  const team = useStore((s) => s.team)!;
  const [members, setMembers] = useState<MemberView[] | undefined>();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setMembers(await loadMembers());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = (action: () => Promise<string | void>) => async () => {
    setError('');
    setStatus('');
    try {
      setStatus((await action()) ?? '');
    } catch (e) {
      const text = e instanceof Error ? e.message : '';
      // dismissing the share sheet isn't an error
      if (!/abort|cancel|dismiss/i.test(text)) setError(errorMessage(e));
    }
  };

  const link = currentInviteUrl(team.inviteCode);
  const message = `Join ${team.name} in Lineup Planner to edit the squad and line-ups: ${link}`;

  return (
    <Screen>
      <Card>
        <Heading>{team.name}</Heading>
        <Muted>Shared team. Changes by any coach are saved for everyone.</Muted>
      </Card>

      <Card>
        <Heading>Invite link</Heading>
        <Text selectable style={{ color: colors.text }}>
          {link}
        </Text>
        <Muted>{PRIVACY}</Muted>
        <Button label="Privacy: what is shared" kind="secondary" onPress={() => router.push('/privacy')} />
        <Button label="Share link" onPress={run(async () => ((await shareText(message)) === 'copied' ? 'Link copied.' : ''))} />
        <Button label="Copy link" kind="secondary" onPress={run(async () => { await copyText(link); return 'Link copied.'; })} />
        <ConfirmButton
          label="Reset link"
          confirmLabel="Tap again: the old link stops working"
          kind="secondary"
          onConfirm={run(async () => { await resetInvite(); return 'New link made. The old one no longer works; coaches already in the team stay.'; })}
        />
      </Card>

      <Card>
        <Heading>Coaches</Heading>
        {members === undefined && <Muted>Loading…</Muted>}
        {members?.map((m) => (
          <Row key={m.id} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: 16, color: colors.text }}>{m.id === team.memberId ? `${m.displayName} (you)` : m.displayName}</Text>
              <Muted>{`Last seen ${formatSeen(m.lastSeenAt)}`}</Muted>
            </View>
            {m.id !== team.memberId && (
              <ConfirmButton
                label="Remove"
                confirmLabel="Remove?"
                onConfirm={run(async () => {
                  await removeMember(m.id);
                  await refresh();
                  return `${m.displayName} was removed.`;
                })}
              />
            )}
          </Row>
        ))}
      </Card>

      {status ? <Notice>{status}</Notice> : null}
      {error ? <Notice error>{error}</Notice> : null}

      <ConfirmButton
        label="Leave team"
        confirmLabel="Tap again to leave (the squad stays on this device)"
        onConfirm={run(async () => {
          await leaveTeam();
          close();
        })}
      />
      {!showDelete ? (
        <Button label="Delete team for everyone…" kind="secondary" onPress={() => setShowDelete(true)} />
      ) : (
        <Card>
          <Heading>Delete team for everyone</Heading>
          <Muted>{`This removes the shared squad and match for all coaches. Each coach keeps the copy on their own phone. Type "${team.name}" to confirm.`}</Muted>
          <TextField label="Team name" value={confirmName} onChangeText={setConfirmName} autoCapitalize="none" />
          <Button
            label="Delete team"
            kind="danger"
            disabled={confirmName.trim().toLowerCase() !== team.name.toLowerCase()}
            onPress={run(async () => {
              await deleteTeamForEveryone(confirmName.trim());
              close();
            })}
          />
        </Card>
      )}
    </Screen>
  );
}
