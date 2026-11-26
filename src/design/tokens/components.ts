/**
 * Layer 3: component tokens. Decisions that belong to one component, derived from the
 * semantic theme so they follow light and dark automatically.
 */
import type { Theme } from './themes';

export function componentTokens(t: Theme) {
  return {
    screen: { padding: t.space.lg, gap: t.space.md, maxWidth: t.size.contentMaxWidth },
    card: {
      padding: t.space.lg,
      gap: t.space.sm,
      radius: t.radius.lg,
      borderWidth: t.borderWidth.thin,
    },
    button: {
      minHeight: t.size.touchTarget,
      paddingX: t.space.lg,
      paddingY: t.space.sm + t.space.xxs,
      radius: t.radius.md,
      borderWidth: t.borderWidth.thin,
      text: 'bodyStrong' as const,
    },
    chip: {
      minHeight: t.size.touchTarget,
      minWidth: t.size.touchTarget,
      paddingX: t.space.md + t.space.xxs,
      radius: t.radius.full,
      borderWidth: t.borderWidth.thin,
      text: 'small' as const,
    },
    input: {
      minHeight: t.size.touchTarget + t.space.xs,
      paddingX: t.space.md,
      paddingY: t.space.sm + t.space.xxs,
      radius: t.radius.md,
      borderWidth: t.borderWidth.thin,
      focusBorderWidth: t.borderWidth.thick,
      text: 'body' as const,
    },
    notice: { padding: t.space.md, gap: t.space.sm, radius: t.radius.md, text: 'small' as const },
    groupBadge: { size: t.size.groupBadge, ringWidth: t.borderWidth.thick, text: 'caption' as const },
    /** Taller than the 49 pt iOS default so the caption-size label fits under the icon. */
    tabBar: { height: 56, text: 'caption' as const },
    /** In SVG units: the pitch is drawn in a 100 × 130 box. */
    pitchMarker: {
      radius: 5,
      ringWidth: 0.8,
      selectedRingWidth: 1.4,
      pinRadius: 1.5,
      roleFontSize: 3.4,
      nameFontSize: 3.6,
      noteFontSize: 2.8,
      lineWidth: 0.5,
    },
  };
}

export type ComponentTokens = ReturnType<typeof componentTokens>;
