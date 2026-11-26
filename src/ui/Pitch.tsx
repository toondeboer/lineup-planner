import type { RefObject } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { Formation, Plan, Player } from '../core';
import { groupColor, lightTheme, useTheme, type Theme } from '../design';
import { componentTokens, type ComponentTokens } from '../design/tokens/components';

type PitchTheme = Theme & { component: ComponentTokens };

export interface PitchMarker {
  name: string;
  /** The player's rotation group, or undefined when they play the whole match. */
  group?: number;
  /** Shown with a pin dot when the user fixed this player in place. */
  pinned?: boolean;
  /** Small label under the name, e.g. "off 23'". */
  note?: string;
}

export const PITCH_WIDTH = 100;
export const PITCH_HEIGHT = 130;
const STRIPES = 8;

export function shortName(name: string, max = 11): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/** The markers for the starting XI: each starter's name, rotation group and when they first go off. */
export function pitchMarkers(
  plan: Plan,
  formation: Formation,
  players: Player[],
  options: { pinned?: Record<string, string | undefined>; notes?: boolean } = {},
): Record<string, PitchMarker> {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const groupOfSlot = new Map<string, number>();
  plan.groups.forEach((g, i) => g.slotIds.forEach((s) => groupOfSlot.set(s, i)));
  const firstOff = new Map<string, number>();
  for (const sub of plan.substitutions) if (!firstOff.has(sub.offId)) firstOff.set(sub.offId, sub.minute);

  const markers: Record<string, PitchMarker> = {};
  for (const slot of formation.slots) {
    const id = plan.starting[slot.id];
    markers[slot.id] = {
      name: nameOf(id),
      group: groupOfSlot.get(slot.id),
      pinned: options.pinned?.[slot.id] !== undefined,
      note: options.notes && firstOff.has(id) ? `off ${firstOff.get(id)}'` : undefined,
    };
  }
  return markers;
}

const exportTheme: PitchTheme = { ...lightTheme, component: componentTokens(lightTheme) };

/**
 * Football pitch with the starting XI. Also used to render the image that gets shared: with
 * `forExport` it always uses the light pitch, so the image looks the same whatever theme the
 * sender uses.
 */
export function Pitch({
  formation,
  markers,
  selectedSlot,
  onSlotPress,
  title,
  svgRef,
  forExport,
}: {
  formation: Formation;
  markers: Record<string, PitchMarker | undefined>;
  selectedSlot?: string;
  onSlotPress?: (slotId: string) => void;
  title?: string;
  svgRef?: RefObject<Svg | null>;
  forExport?: boolean;
}) {
  const appTheme = useTheme();
  const t: PitchTheme = forExport ? exportTheme : appTheme;
  const pitch = t.color.pitch;
  const m = t.component.pitchMarker;
  const font = t.font.svg;
  const stripeHeight = PITCH_HEIGHT / STRIPES;

  return (
    <View style={{ width: '100%', aspectRatio: PITCH_WIDTH / PITCH_HEIGHT }}>
      <Svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${PITCH_WIDTH} ${PITCH_HEIGHT}`}>
        <Rect x={0} y={0} width={PITCH_WIDTH} height={PITCH_HEIGHT} fill={pitch.grass} rx={2} />
        {Array.from({ length: STRIPES }, (_, i) =>
          i % 2 ? <Rect key={i} x={0} y={i * stripeHeight} width={PITCH_WIDTH} height={stripeHeight} fill={pitch.stripe} /> : null,
        )}
        <G fill="none" stroke={pitch.line} strokeWidth={m.lineWidth}>
          <Rect x={3} y={3} width={94} height={124} />
          <Line x1={3} y1={65} x2={97} y2={65} />
          <Circle cx={50} cy={65} r={10} />
          <Rect x={27} y={3} width={46} height={18} />
          <Rect x={27} y={105} width={46} height={22} />
        </G>
        {title ? (
          <SvgText fontFamily={font} x={50} y={9} fontSize={4} fontWeight="bold" fill={pitch.label} textAnchor="middle">
            {title}
          </SvgText>
        ) : null}
        {formation.slots.map((slot) => {
          const marker = markers[slot.id];
          const cx = slot.x;
          const cy = 11 + slot.y * 1.1;
          const selected = selectedSlot === slot.id;
          const fullTime = marker !== undefined && marker.group === undefined;
          const fill = marker ? groupColor(t, marker.group) : pitch.markerEmpty;
          return (
            <G key={slot.id} onPress={onSlotPress ? () => onSlotPress(slot.id) : undefined} accessibilityLabel={`Slot ${slot.id}`}>
              <Circle
                cx={cx}
                cy={cy}
                r={m.radius}
                fill={fill}
                stroke={selected ? pitch.selected : pitch.markerRing}
                strokeWidth={selected ? m.selectedRingWidth : m.ringWidth}
              />
              {marker?.pinned ? (
                <Circle cx={cx + 3.8} cy={cy - 3.8} r={m.pinRadius} fill={pitch.selected} stroke={pitch.grass} strokeWidth={0.4} />
              ) : null}
              <SvgText
                fontFamily={font}
                x={cx}
                y={cy + 1.3}
                fontSize={m.roleFontSize}
                fontWeight="bold"
                fill={fullTime ? pitch.fullTimeLabel : pitch.groupLabel}
                textAnchor="middle"
              >
                {slot.role}
              </SvgText>
              <SvgText fontFamily={font} x={cx} y={cy + 9.4} fontSize={m.nameFontSize} fontWeight="bold" fill={pitch.label} textAnchor="middle">
                {marker ? shortName(marker.name) : '—'}
              </SvgText>
              {marker?.note ? (
                <SvgText fontFamily={font} x={cx} y={cy + 13} fontSize={m.noteFontSize} fill={pitch.labelSoft} textAnchor="middle">
                  {marker.note}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
