import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import type { InvitePreview } from '../../core';
import { useStore } from '../../state/store';
import { api, isCloudEnabled } from '../../sync/api';
import { parseInviteCode } from '../../sync/helpers';
import { errorMessage, joinTeam } from '../../sync/teams';
import { Button, Card, Heading, Muted, Notice, Screen, TextField } from '../../ui/components';

/** Opened from an invite link: /join/<code>. */
export default function JoinScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = parseInviteCode(String(raw ?? ''));
  const team = useStore((s) => s.team);
  const ownPlayers = useStore((s) => s.squad.filter((p) => !p.isDemo).length);
  const [preview, setPreview] = useState<InvitePreview | undefined>();
  const [yourName, setYourName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code || !isCloudEnabled() || team) return;
    api.previewInvite(code).then(setPreview, (e) => setError(errorMessage(e)));
  }, [code, team]);

  // the link may be the first thing opened, so there may be no screen to go back to
  const home = () => router.replace('/');

  if (!isCloudEnabled()) {
    return (
      <Message text="Sharing a team isn't available in this version of the app." onDone={home} />
    );
  }
  if (!code) {
    return <Message text="This invite link isn't complete. Ask the coach to send it again." onDone={home} />;
  }
  if (team) {
    return (
      <Message
        text={`This phone is already in ${team.name}. To join another team, first leave ${team.name} on its team screen.`}
        onDone={home}
      />
    );
  }

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      await joinTeam(code, yourName.trim());
      home();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        {preview ? (
          <>
            <Heading>{`Join ${preview.teamName}`}</Heading>
            <Muted>
              {`${preview.playerCount} player${preview.playerCount === 1 ? '' : 's'}, ${preview.memberCount} coach${preview.memberCount === 1 ? '' : 'es'}. You'll be able to edit the squad and make line-ups together.`}
            </Muted>
            {ownPlayers > 0 && (
              <Notice error>
                {`The ${ownPlayers} player${ownPlayers === 1 ? '' : 's'} on this phone will be replaced by the team's squad.`}
              </Notice>
            )}
            <TextField label="Your name" value={yourName} onChangeText={setYourName} maxLength={40} autoComplete="name" />
            <Button
              label={busy ? 'Joining…' : 'Join team'}
              onPress={join}
              disabled={busy || !yourName.trim()}
            />
          </>
        ) : (
          <Muted>{error ? '' : 'Checking the invite…'}</Muted>
        )}
        {error ? <Notice error>{error}</Notice> : null}
      </Card>
      <Button label="Cancel" kind="secondary" onPress={home} />
      <Button label="Privacy: what is shared" kind="secondary" onPress={() => router.push('/privacy')} />
    </Screen>
  );
}

function Message({ text, onDone }: { text: string; onDone: () => void }) {
  return (
    <Screen>
      <Card>
        <Muted>{text}</Muted>
      </Card>
      <Button label="Go to the squad" kind="secondary" onPress={onDone} />
    </Screen>
  );
}
