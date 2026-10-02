import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { ROLES, type Player, type Rating } from '../../core';
import { useStore } from '../../state/store';
import { Button, Card, Chip, Heading, Muted, Row, Screen } from '../../ui/components';
import { RATING_LABELS, ROLE_NAMES } from '../../ui/roles';
import { colors } from '../../ui/theme';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useStore((s) => s.squad.find((p) => p.id === id));
  const upsert = useStore((s) => s.upsertPlayer);
  const remove = useStore((s) => s.removePlayer);
  const [name, setName] = useState(existing?.name ?? '');
  const [ratings, setRatings] = useState<Player['ratings']>(existing?.ratings ?? {});

  const save = () => {
    upsert({ id, name: name.trim(), ratings, isGuest: existing?.isGuest });
    router.back();
  };

  return (
    <Screen>
      <Card>
        <Heading>Name</Heading>
        <TextInput
          accessibilityLabel="Player name"
          value={name}
          onChangeText={setName}
          placeholder="Player name"
          autoFocus={!existing}
          style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, fontSize: 16 }}
        />
      </Card>
      <Card>
        <Heading>Positions</Heading>
        <Muted>Preferred = best position, OK = comfortable, Emergency = only if needed, No = avoid.</Muted>
        {ROLES.map((role) => (
          <Row key={role} style={{ justifyContent: 'space-between' }}>
            <Text style={{ width: 130, color: colors.text }}>{ROLE_NAMES[role]}</Text>
            <Row style={{ gap: 4 }}>
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
