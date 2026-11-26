import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { substitutionLines, type Plan } from '../../core';
import { makeStyles } from '../../design';
import { useStore } from '../../state/store';
import { usePlan } from '../../state/usePlan';
import { Button, Card, Chip, GroupBadge, Grow, Heading, Muted, Row, Screen, Text, Title } from '../../ui/components';
import { Pitch, pitchMarkers } from '../../ui/Pitch';

function FitSummary({ fit }: { fit: Plan['fit'] }) {
  const total = fit.preferred + fit.ok + fit.emergency + fit.unsuited;
  const pct = (n: number) => `${Math.round((100 * n) / total)}%`;
  return (
    <Card>
      <Heading>Position fit</Heading>
      <Text>
        {`${pct(fit.preferred)} preferred · ${pct(fit.ok)} OK · ${pct(fit.emergency)} emergency · ${pct(fit.unsuited)} not suited`}
      </Text>
      {fit.unsuited + fit.emergency > 0 && (
        <Muted>
          Some players end up in positions they are not rated for. Rate them for more positions on the Squad tab, or
          tap Recalculate.
        </Muted>
      )}
    </Card>
  );
}

export default function PlanScreen() {
  const styles = useStyles();
  const { plan, error, formation, players, pending } = usePlan();
  const pinned = useStore((s) => s.match.pinned);
  const pin = useStore((s) => s.pin);
  const clearPins = useStore((s) => s.clearPins);
  const recalculate = useStore((s) => s.recalculate);
  const [selected, setSelected] = useState<string | undefined>();

  if (!plan) {
    return (
      <Screen>
        <Title>Plan</Title>
        <Card>
          <Muted>
            {pending
              ? 'Making the plan…'
              : players.length < 11
                ? `Select at least 11 players on the Match tab (now ${players.length}).`
                : (error ?? '')}
          </Muted>
        </Card>
      </Screen>
    );
  }

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const markers = pitchMarkers(plan, formation, players, { pinned, notes: true });
  const groupOfSlot = (slotId: string) => plan.groups.findIndex((g) => g.slotIds.includes(slotId));
  const roleOfSlot = (slotId: string) => formation.slots.find((s) => s.id === slotId)?.role ?? slotId;
  const lines = substitutionLines(plan, players);
  const hasPins = Object.keys(pinned).length > 0;

  return (
    <Screen>
      <Title>Plan</Title>
      <View style={pending && styles.pending}>
        <Pitch formation={formation} markers={markers} selectedSlot={selected} onSlotPress={(s) => setSelected(s === selected ? undefined : s)} />
      </View>
      <Row gap="sm">
        {plan.groups.map((g, i) => (
          <Row key={i} gap="xs">
            <GroupBadge group={i} />
            <Text variant="caption" tone="muted">
              {g.slotIds.map(roleOfSlot).join(' ')}
            </Text>
          </Row>
        ))}
        <Row gap="xs">
          <GroupBadge group={undefined} />
          <Text variant="caption" tone="muted">
            Full match
          </Text>
        </Row>
      </Row>
      <Muted>
        {pending
          ? 'Updating the plan…'
          : 'Colours and letters show rotation groups. Tap a position to choose who starts there; substitutions are recalculated.'}
      </Muted>

      {selected && (
        <Card>
          <Heading>{`Who starts at ${selected}?`}</Heading>
          <Row>
            {players.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                selected={plan.starting[selected] === p.id}
                onPress={() => {
                  pin(selected, p.id);
                  setSelected(undefined);
                }}
              />
            ))}
          </Row>
          <Row>
            {pinned[selected] !== undefined && (
              <Button
                label="Back to automatic"
                kind="secondary"
                onPress={() => {
                  pin(selected, undefined);
                  setSelected(undefined);
                }}
              />
            )}
            <Button label="Cancel" kind="secondary" onPress={() => setSelected(undefined)} />
          </Row>
        </Card>
      )}
      <Button label="Recalculate" kind="secondary" onPress={() => { recalculate(); setSelected(undefined); }} />
      <Button label="Share lineup" onPress={() => router.push('/share')} />
      {hasPins && <Button label="Reset to automatic lineup" kind="secondary" onPress={() => { clearPins(); setSelected(undefined); }} />}

      <FitSummary fit={plan.fit} />

      {plan.warnings.length > 0 && (
        <Card tone="warning">
          <Text variant="heading" tone="warning" header>
            Heads up
          </Text>
          {plan.warnings.map((w, i) => (
            <Text key={i} tone="warning">
              {w.type === 'unsuited-position'
                ? `${nameOf(w.playerId)} plays ${w.slotId} (rated "no") from ${w.from}' to ${w.to}'`
                : `${nameOf(w.playerId)} is not rated as a goalkeeper`}
            </Text>
          ))}
        </Card>
      )}

      <Card>
        <Heading>Substitutions</Heading>
        {lines.length === 0 && <Muted>No substitutions.</Muted>}
        {lines.map((l, i) => {
          const group = groupOfSlot(l.slotId);
          return (
            <Row key={i} wrap={false}>
              <GroupBadge group={group < 0 ? undefined : group} />
              <Text variant="bodyStrong" tabular style={styles.minute}>{`${l.minute}'`}</Text>
              <Grow>
                <Text>{`${l.on} on for ${l.off} (${l.slotId}${l.onSlotId ? `, plays ${l.onSlotId}` : ''})`}</Text>
                {l.moves.map((m, j) => (
                  <Muted key={j}>{`↳ ${m.name} moves to ${m.toSlotId}`}</Muted>
                ))}
              </Grow>
            </Row>
          );
        })}
      </Card>

      <Card>
        <Heading>Bench at kick-off</Heading>
        <Muted>{plan.startingBench.map(nameOf).join(', ') || 'Nobody'}</Muted>
      </Card>

      <Card>
        <Heading>Minutes played</Heading>
        {players
          .slice()
          .sort((a, b) => plan.minutes[b.id] - plan.minutes[a.id] || a.name.localeCompare(b.name))
          .map((p) => (
            <Row key={p.id} justify="space-between" wrap={false}>
              <Grow>
                <Text>{p.name}</Text>
              </Grow>
              <Text tone="muted" tabular>{`${plan.minutes[p.id]} min`}</Text>
            </Row>
          ))}
      </Card>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  pending: { opacity: t.opacity.pending },
  minute: { minWidth: t.space.xxl + t.space.sm },
}));
