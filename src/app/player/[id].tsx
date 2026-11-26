import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ROLES, type Player, type Rating } from '../../core';
import { useStore } from '../../state/store';
import { Button, Card, Chip, Grow, Heading, Muted, Row, Screen, Text, TextField } from '../../ui/components';
import { RATING_LABELS, ROLE_NAMES } from '../../ui/roles';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useStore((s) => s.squad.find((p) => p.id === id));
  const upsert = useStore((s) => s.upsertPlayer);
  const remove = useStore((s) => s.removePlayer);
  const [name, setName] = useState(existing?.name ?? '');
  const [ratings, setRatings] = useState<Player['ratings']>(existing?.ratings ?? {});

  const save = () => {
    // keep flags such as isGuest and isDemo
    upsert({ ...existing, id, name: name.trim(), ratings });
    router.back();
  };

  return (
    <Screen>
      <Card>
        <Heading>Name</Heading>
        <TextField label="Player name" value={name} onChangeText={setName} autoFocus={!existing} />
      </Card>
      <Card>
        <Heading>Positions</Heading>
        <Muted>Preferred = best position, OK = comfortable, Emergency = only if needed, No = avoid.</Muted>
        {ROLES.map((role) => (
          <Row key={role} justify="space-between">
            <Grow>
              <Text>{ROLE_NAMES[role]}</Text>
            </Grow>
            <Row gap="xs">
              {([0, 1, 2, 3] as Rating[]).map((value) => (
                <Chip
                  key={value}
                  label={value === 0 ? 'No' : String(value)}
                  selected={(ratings[role] ?? 0) === value}
                  onPress={() => setRatings({ ...ratings, [role]: value })}
                />
              ))}
            </Row>
          </Row>
        ))}
        <Muted>{`0 = ${RATING_LABELS[0]}, 1 = ${RATING_LABELS[1]}, 2 = ${RATING_LABELS[2]}, 3 = ${RATING_LABELS[3]}`}</Muted>
      </Card>
      <Button label="Save" onPress={save} disabled={name.trim().length === 0} />
      {existing && (
        <Button
          label="Remove from squad"
          kind="danger"
          onPress={() => {
            remove(id);
            router.back();
          }}
        />
      )}
    </Screen>
  );
}
