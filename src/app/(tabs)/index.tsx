import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { newId, useStore } from '../../state/store';
import { Button, Card, Muted, Row, Screen, Title } from '../../ui/components';
import { roleSummary } from '../../ui/roles';
import { colors } from '../../ui/theme';

export default function SquadScreen() {
  const squad = useStore((s) => s.squad);
  return (
    <Screen>
      <Title>Squad</Title>
      <Muted>Add your players and rate how well they play each position.</Muted>
      {squad.length === 0 && (
        <Card>
          <Muted>No players yet. Add your first player to get started.</Muted>
        </Card>
      )}
      {squad.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${p.name}`}
          onPress={() => router.push(`/player/${p.id}`)}
        >
          <Card>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{p.name}</Text>
                <Muted>{roleSummary(p)}</Muted>
              </View>
              {p.isGuest && <Muted>guest</Muted>}
            </Row>
          </Card>
        </Pressable>
      ))}
      <Button label="Add player" onPress={() => router.push(`/player/${newId()}`)} />
    </Screen>
  );
}
