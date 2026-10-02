import { useRef, useState } from 'react';
import { Linking, Platform, Text } from 'react-native';
import type Svg from 'react-native-svg';
import { formatShareMessage } from '../core';
import { captureImage, copyText, shareImage, shareText, whatsappUrl } from '../share/share';
import { usePlan } from '../state/usePlan';
import { Button, Card, Heading, Muted, Screen } from '../ui/components';
import { Pitch, type PitchMarker } from '../ui/Pitch';
import { colors, groupColors } from '../ui/theme';

export default function ShareScreen() {
  const { plan, formation, players } = usePlan();
  const svgRef = useRef<Svg | null>(null);
  const [status, setStatus] = useState('');

  if (!plan) {
    return (
      <Screen>
        <Muted>Make a plan first.</Muted>
      </Screen>
    );
  }

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const groupOfSlot = new Map<string, number>();
  plan.groups.forEach((g, i) => g.slotIds.forEach((s) => groupOfSlot.set(s, i)));
  const markers: Record<string, PitchMarker> = {};
  for (const slot of formation.slots) {
    const group = groupOfSlot.get(slot.id);
    markers[slot.id] = {
      name: nameOf(plan.starting[slot.id]),
      color: group === undefined ? '#263238' : groupColors[group % groupColors.length],
    };
  }
  const message = formatShareMessage(plan, players, formation.name);

  const run = (action: () => Promise<string | void>) => async () => {
    try {
      setStatus((await action()) ?? '');
    } catch (e) {
      // dismissing the share sheet rejects on some platforms; that is not an error worth showing
      const text = e instanceof Error ? e.message : String(e);
      setStatus(/abort|cancel|dismiss/i.test(text) ? '' : text);
    }
  };

  const withImage = async <T,>(fn: (base64: string) => Promise<T>): Promise<T> => {
    if (!svgRef.current) throw new Error('Image is not ready yet');
    return fn(await captureImage(svgRef.current));
  };

  return (
    <Screen>
      <Card>
        <Heading>Starting lineup</Heading>
        <Pitch formation={formation} markers={markers} title={`Starting lineup · ${formation.name}`} svgRef={svgRef} />
      </Card>
      <Card>
        <Heading>Message</Heading>
        <Text selectable style={{ color: colors.text, lineHeight: 20 }}>
          {message}
        </Text>
      </Card>
      <Button
        label={Platform.OS === 'web' ? 'Share image and text' : 'Share image'}
        onPress={run(() =>
          withImage(async (b64) => {
            const result = await shareImage(b64, message);
            return result === 'downloaded' ? 'Image saved. Add it to the chat, then paste the text.' : '';
          }),
        )}
      />
      <Button label="Share text" kind="secondary" onPress={run(async () => ((await shareText(message)) === 'copied' ? 'Text copied.' : ''))} />
      <Button label="Copy text" kind="secondary" onPress={run(async () => { await copyText(message); return 'Text copied.'; })} />
      {Platform.OS === 'web' && (
        <Button label="Open WhatsApp with the text" kind="secondary" onPress={() => Linking.openURL(whatsappUrl(message))} />
      )}
      {status ? <Muted>{status}</Muted> : null}
      <Muted>
        WhatsApp can't take a picture and text from a single share on every phone, so on some devices share the
        image first and then the text.
      </Muted>
    </Screen>
  );
}
