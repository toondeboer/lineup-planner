import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { substitutionLines, type Plan } from '../../core';
import { useStore } from '../../state/store';
import { usePlan } from '../../state/usePlan';
import { Button, Card, Chip, Heading, Muted, Row, Screen, Title } from '../../ui/components';
import { Pitch, type PitchMarker } from '../../ui/Pitch';
import { colors, groupColors } from '../../ui/theme';

function FitSummary({ fit }: { fit: Plan['fit'] }) {
  const total = fit.preferred + fit.ok + fit.emergency + fit.unsuited;
  const pct = (n: number) => `${Math.round((100 * n) / total)}%`;
  return (
    <Card>
      <Heading>Position fit</Heading>
      <Text style={{ color: colors.text }}>
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
  const groupOfSlot = new Map<string, number>();
  plan.groups.forEach((g, i) => g.slotIds.forEach((s) => groupOfSlot.set(s, i)));
  const firstOff = new Map<string, number>();
  for (const sub of plan.substitutions) if (!firstOff.has(sub.offId)) firstOff.set(sub.offId, sub.minute);

  const markers: Record<string, PitchMarker> = {};
  for (const slot of formation.slots) {
    const id = plan.starting[slot.id];
    const group = groupOfSlot.get(slot.id);
    markers[slot.id] = {
      name: nameOf(id),
      color: group === undefined ? '#263238' : groupColors[group % groupColors.length],
      pinned: pinned[slot.id] !== undefined,
      note: firstOff.has(id) ? `off ${firstOff.get(id)}'` : undefined,
    };
  }

  const lines = substitutionLines(plan, players);
  const colorOfSlot = (slotId: string) => {
    const g = groupOfSlot.get(slotId);
    return g === undefined ? '#263238' : groupColors[g % groupColors.length];
  };
  const hasPins = Object.keys(pinned).length > 0;

  return (
    <Screen>
      <Title>Plan</Title>
      <View style={{ opacity: pending ? 0.5 : 1 }}>
        <Pitch formation={formation} markers={markers} selectedSlot={selected} onSlotPress={(s) => setSelected(s === selected ? undefined : s)} />
      </View>
      <Muted>
        {pending
          ? 'Updating the plan…'
          : 'Colours show rotation groups. Tap a position to choose who starts there; substitutions are recalculated.'}
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
        <Card style={{ borderColor: colors.warn }}>
          <Heading>Heads up</Heading>
          {plan.warnings.map((w, i) => (
            <Text key={i} style={{ color: colors.warn }}>
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
        {lines.map((l, i) => (
          <Row key={i} style={{ flexWrap: 'nowrap' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colorOfSlot(l.slotId) }} />
            <Text style={{ width: 40, fontWeight: '700', color: colors.text }}>{`${l.minute}'`}</Text>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: colors.text }}>
                {`${l.on} on for ${l.off} (${l.slotId}${l.onSlotId ? `, plays ${l.onSlotId}` : ''})`}
              </Text>
              {l.moves.map((m, j) => (
                <Muted key={j}>{`↳ ${m.name} moves to ${m.toSlotId}`}</Muted>
              ))}
            </View>
          </Row>
        ))}
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
            <Row key={p.id} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Text style={{ color: colors.text }}>{p.name}</Text>
              <Text style={{ color: colors.muted }}>{`${plan.minutes[p.id]} min`}</Text>
            </Row>
          ))}
      </Card>
    </Screen>
  );
}
