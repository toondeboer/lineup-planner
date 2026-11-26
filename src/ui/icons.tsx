import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type TabIconName = 'squad' | 'match' | 'plan';

/** Line icons for the tab bar, drawn on a 24 × 24 grid. The colour comes from the tab bar's tint. */
export function TabIcon({ name, color, size }: { name: TabIconName; color: ColorValue; size: number }) {
  const stroke = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'squad' && (
        <>
          <Circle cx={9} cy={8} r={3.2} {...stroke} />
          <Path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" {...stroke} />
          <Circle cx={17} cy={9} r={2.4} {...stroke} />
          <Path d="M16 14.6c2.3.1 3.9 1.5 4.5 4.4" {...stroke} />
        </>
      )}
      {name === 'match' && (
        <>
          <Rect x={4} y={5} width={16} height={15} rx={2.5} {...stroke} />
          <Path d="M4 9.5h16M8.5 3v4M15.5 3v4" {...stroke} />
        </>
      )}
      {name === 'plan' && (
        <>
          <Rect x={4.5} y={3} width={15} height={18} rx={2} {...stroke} />
          <Path d="M4.5 12h15" {...stroke} />
          <Circle cx={12} cy={12} r={2.6} {...stroke} />
        </>
      )}
    </Svg>
  );
}
