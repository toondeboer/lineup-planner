import { View } from 'react-native';
import type { RefObject } from 'react';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { Formation } from '../core';
import { colors } from './theme';

export interface PitchMarker {
  name: string;
  /** Fill colour of the player's disc (their rotation group). */
  color: string;
  /** Shown as a ring when the user fixed this player in place. */
  pinned?: boolean;
  /** Small label under the name, e.g. "-> 23'". */
  note?: string;
}

export const PITCH_WIDTH = 100;
export const PITCH_HEIGHT = 130;

export function shortName(name: string, max = 11): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/** Football pitch with the starting XI. Also used to render the image that gets shared. */
export function Pitch({
  formation,
  markers,
  selectedSlot,
  onSlotPress,
  title,
  svgRef,
}: {
  formation: Formation;
  markers: Record<string, PitchMarker | undefined>;
  selectedSlot?: string;
  onSlotPress?: (slotId: string) => void;
  title?: string;
  svgRef?: RefObject<Svg | null>;
}) {
  const line = colors.pitchLine;
  return (
    <View style={{ width: '100%', aspectRatio: PITCH_WIDTH / PITCH_HEIGHT }}>
      <Svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${PITCH_WIDTH} ${PITCH_HEIGHT}`}>
        <Rect x={0} y={0} width={PITCH_WIDTH} height={PITCH_HEIGHT} fill={colors.pitch} rx={2} />
        <Rect x={3} y={3} width={94} height={124} fill="none" stroke={line} strokeWidth={0.5} />
        <Line x1={3} y1={65} x2={97} y2={65} stroke={line} strokeWidth={0.5} />
        <Circle cx={50} cy={65} r={10} fill="none" stroke={line} strokeWidth={0.5} />
        <Rect x={27} y={3} width={46} height={18} fill="none" stroke={line} strokeWidth={0.5} />
        <Rect x={27} y={105} width={46} height={22} fill="none" stroke={line} strokeWidth={0.5} />
        {title ? (
          <SvgText fontFamily="Arial, Helvetica, sans-serif" x={50} y={9} fontSize={4} fontWeight="bold" fill="#fff" textAnchor="middle">
            {title}
          </SvgText>
        ) : null}
        {formation.slots.map((slot) => {
          const marker = markers[slot.id];
          const cx = slot.x;
          const cy = 11 + slot.y * 1.1;
          const selected = selectedSlot === slot.id;
          return (
            <G key={slot.id} onPress={onSlotPress ? () => onSlotPress(slot.id) : undefined} accessibilityLabel={`Slot ${slot.id}`}>
              <Circle
                cx={cx}
                cy={cy}
                r={4.6}
                fill={marker?.color ?? '#00000044'}
                stroke={selected ? '#ffeb3b' : marker?.pinned ? '#fff' : '#00000055'}
                strokeWidth={selected ? 1.2 : marker?.pinned ? 0.9 : 0.4}
              />
              <SvgText fontFamily="Arial, Helvetica, sans-serif" x={cx} y={cy + 1.4} fontSize={3.4} fontWeight="bold" fill="#fff" textAnchor="middle">
                {slot.role}
              </SvgText>
              <SvgText fontFamily="Arial, Helvetica, sans-serif" x={cx} y={cy + 9} fontSize={3.6} fontWeight="bold" fill="#fff" textAnchor="middle">
                {marker ? shortName(marker.name) : '—'}
              </SvgText>
              {marker?.note ? (
                <SvgText fontFamily="Arial, Helvetica, sans-serif" x={cx} y={cy + 12.6} fontSize={2.8} fill="#ffffffcc" textAnchor="middle">
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
