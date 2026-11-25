import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { newId, useStore } from '../../state/store';
import { isCloudEnabled } from '../../sync/api';
import { Button, Card, Muted, Row, Screen, Title } from '../../ui/components';
import { roleSummary } from '../../ui/roles';
import { colors } from '../../ui/theme';

export default function SquadScreen() {
  const squad = useStore((s) => s.squad);
  const loadDemoSquad = useStore((s) => s.loadDemoSquad);
  const removeDemoSquad = useStore((s) => s.removeDemoSquad);
  const hasDemo = squad.some((p) => p.isDemo);
  const team = useStore((s) => s.team);
  return (
    <Screen>
      <Title>Squad</Title>
      <Muted>Add your players and rate how well they play each position.</Muted>
      {isCloudEnabled() &&
        (team ? (
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{team.name}</Text>
                <Muted>Shared with your coaches</Muted>
              </View>
              <Button label="Team & invite link" kind="secondary" onPress={() => router.push('/team')} />
            </Row>
          </Card>
        ) : (
          <Button label="Share with your coaches" kind="secondary" onPress={() => router.push('/team')} />
        ))}
      {hasDemo && (
        <Card>
          <Muted>You're trying the app with the demo team. Remove it to start with your own players.</Muted>
          <Button label="Remove demo team" kind="danger" onPress={removeDemoSquad} />
        </Card>
      )}
      {squad.length === 0 && (
        <Card>
          <Muted>No players yet. Add your first player to get started, or try the app with a demo team.</Muted>
          <Button label="Load demo team (15 players)" kind="secondary" onPress={loadDemoSquad} />
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
              {p.isDemo && <Muted>demo</Muted>}
            </Row>
          </Card>
        </Pressable>
      ))}
      <Button label="Add player" onPress={() => router.push(`/player/${newId()}`)} />
    </Screen>
  );
}
