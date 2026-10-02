import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { FORMATIONS, ROLES, chooseGoalkeepers, describeRotation, newGuest, type Role } from '../../core';
import { availablePlayers, newId, useStore } from '../../state/store';
import { Button, Card, Chip, Heading, Muted, Row, Screen, Title } from '../../ui/components';
import { ROLE_NAMES } from '../../ui/roles';
import { colors } from '../../ui/theme';

export default function MatchScreen() {
  const squad = useStore((s) => s.squad);
  const match = useStore((s) => s.match);
  const toggleAvailable = useStore((s) => s.toggleAvailable);
  const setAll = useStore((s) => s.setAllAvailable);
  const addGuest = useStore((s) => s.addGuest);
  const removeGuest = useStore((s) => s.removeGuest);
  const setFormation = useStore((s) => s.setFormation);
  const toggleGoalkeeper = useStore((s) => s.toggleGoalkeeper);
  const setStrictSwaps = useStore((s) => s.setStrictSwaps);

  const [guestName, setGuestName] = useState('');
  const [guestPosition, setGuestPosition] = useState<Role | 'ANY'>('ANY');
  const [saveGuest, setSaveGuest] = useState(false);

  const players = availablePlayers(squad, match);
  const keepers = match.goalkeeperIds.length ? match.goalkeeperIds : players.length ? chooseGoalkeepers(players) : [];
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id;

  return (
    <Screen>
      <Title>Match</Title>

      <Card>
        <Heading>Who is playing?</Heading>
        {squad.length === 0 && <Muted>Add players on the Squad tab first.</Muted>}
        <Row>
          {squad.map((p) => (
            <Chip key={p.id} label={p.name} selected={match.availableIds.includes(p.id)} onPress={() => toggleAvailable(p.id)} />
          ))}
        </Row>
        {squad.length > 0 && (
          <Row>
            <Button label="Everyone" kind="secondary" onPress={() => setAll(true)} />
            <Button label="Nobody" kind="secondary" onPress={() => setAll(false)} />
          </Row>
        )}
      </Card>

      <Card>
        <Heading>Guests</Heading>
        {match.guests.map((g) => (
          <Row key={g.id} style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text }}>{g.name}</Text>
            <Button label={`Remove ${g.name}`} kind="secondary" onPress={() => removeGuest(g.id)} />
          </Row>
        ))}
        <TextInput
          accessibilityLabel="Guest name"
          value={guestName}
          onChangeText={setGuestName}
          placeholder="Guest name"
          style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, fontSize: 16 }}
        />
        <Muted>Usual position</Muted>
        <Row>
          {(['ANY', ...ROLES] as const).map((r) => (
            <Chip key={r} label={r === 'ANY' ? 'Any' : ROLE_NAMES[r]} selected={guestPosition === r} onPress={() => setGuestPosition(r)} />
          ))}
        </Row>
        <Row>
          <Chip label="Save to squad" selected={saveGuest} onPress={() => setSaveGuest(!saveGuest)} />
        </Row>
        <Button
          label="Add guest"
          disabled={guestName.trim().length === 0}
          onPress={() => {
            addGuest(newGuest(newId(), guestName.trim(), guestPosition), saveGuest);
            setGuestName('');
          }}
        />
      </Card>

      <Card>
        <Heading>Formation</Heading>
        <Row>
          {FORMATIONS.map((f) => (
            <Chip key={f.id} label={f.name} selected={match.formationId === f.id} onPress={() => setFormation(f.id)} />
          ))}
        </Row>
      </Card>

      <Card>
        <Heading>Goalkeeper</Heading>
        <Muted>
          {match.goalkeeperIds.length
            ? 'Pick two keepers to share the match, a half each.'
            : `Chosen automatically: ${keepers.map(nameOf).join(' and ') || 'nobody yet'}. Tap players to choose yourself.`}
        </Muted>
        <Row>
          {players.map((p) => (
            <Chip key={p.id} label={p.name} selected={match.goalkeeperIds.includes(p.id)} onPress={() => toggleGoalkeeper(p.id)} />
          ))}
        </Row>
      </Card>

      <Card>
        <Heading>Substitutions</Heading>
        <Muted>
          Playing time is always shared as equally as possible. If a substitution would otherwise put someone in a
          position they cannot play, a teammate may shift position. Choose like-for-like if the substitute must
          always take the exact position of the player going off.
        </Muted>
        <Row>
          <Chip label="Teammates may shift" selected={!match.strictSwaps} onPress={() => setStrictSwaps(false)} />
          <Chip label="Like-for-like only" selected={!!match.strictSwaps} onPress={() => setStrictSwaps(true)} />
        </Row>
      </Card>

      <Card>
        <Heading>{`${players.length} players`}</Heading>
        <Muted>{describeRotation(players.length, keepers.length || 1)}</Muted>
      </Card>
    </Screen>
  );
}
