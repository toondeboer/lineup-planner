import { useEffect, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { groupColor, groupLetter, makeStyles, useTheme, type TextVariant } from '../design';

export function Screen({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      <View style={styles.inner}>{children}</View>
    </ScrollView>
  );
}

export type TextTone = 'default' | 'muted' | 'link' | 'success' | 'warning' | 'danger';

/** All text in the app goes through this, so every line uses a style from the type scale. */
export function Text({
  variant = 'body',
  tone = 'default',
  tabular,
  selectable,
  header,
  style,
  children,
}: {
  variant?: TextVariant;
  tone?: TextTone;
  /** Digits of equal width, so minutes line up in a column. */
  tabular?: boolean;
  selectable?: boolean;
  /** Announced as a heading by screen readers. */
  header?: boolean;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
}) {
  const t = useTheme();
  const color = {
    default: t.color.text.primary,
    muted: t.color.text.muted,
    link: t.color.text.link,
    success: t.color.status.success.fg,
    warning: t.color.status.warning.fg,
    danger: t.color.status.danger.fg,
  }[tone];
  return (
    <RNText
      selectable={selectable}
      accessibilityRole={header ? 'header' : undefined}
      style={[t.typography[variant], { color }, tabular && { fontVariant: ['tabular-nums'] }, style]}
    >
      {children}
    </RNText>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text variant="display" header>
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text variant="heading" header>
      {children}
    </Text>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return (
    <Text variant="small" tone="muted">
      {children}
    </Text>
  );
}

export function Card({ children, tone }: { children: ReactNode; tone?: 'warning' }) {
  const styles = useStyles();
  return <View style={[styles.card, tone === 'warning' && styles.cardWarning]}>{children}</View>;
}

type ButtonKind = 'primary' | 'secondary' | 'danger';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
}) {
  const t = useTheme();
  const styles = useStyles();
  const action = t.color.action[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled
          ? { backgroundColor: t.color.action.disabled.bg, borderColor: t.color.action.disabled.bg }
          : { backgroundColor: pressed ? action.bgPressed : action.bg, borderColor: action.border },
      ]}
    >
      <Text
        variant={t.component.button.text}
        style={[styles.buttonText, { color: disabled ? t.color.action.disabled.fg : action.fg }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A button for actions that are hard to undo: the first tap asks for confirmation, the second within
 * 5 seconds runs it. Works on the web too, where React Native's Alert shows nothing.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  kind = 'danger',
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <Button
      label={armed ? confirmLabel : label}
      kind={armed ? 'danger' : kind}
      disabled={disabled}
      onPress={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    />
  );
}

export function TextField({ label, ...props }: { label: string } & Omit<TextInputProps, 'style'>) {
  const t = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={t.color.text.muted}
      selectionColor={t.color.border.focus}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[styles.input, focused && styles.inputFocused]}
    />
  );
}

/** A message under a form or action: an error, a warning, a success, or neutral. */
export function Notice({
  children,
  error,
  tone,
}: {
  children: ReactNode;
  /** Shorthand for `tone="danger"`. */
  error?: boolean;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const t = useTheme();
  const styles = useStyles();
  const resolved = error ? 'danger' : (tone ?? 'neutral');
  if (resolved === 'neutral') return <Muted>{children}</Muted>;
  const status = t.color.status[resolved];
  return (
    <View style={[styles.notice, { backgroundColor: status.bg }]} accessibilityRole={resolved === 'danger' ? 'alert' : undefined}>
      <Text variant={t.component.notice.text} tone={resolved}>
        {children}
      </Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        pressed && !selected && { backgroundColor: t.color.action.secondary.bgPressed },
        selected && { backgroundColor: t.color.action.selected.bg, borderColor: t.color.action.selected.bg },
      ]}
    >
      <Text variant={t.component.chip.text} style={selected && { color: t.color.action.selected.fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Row({
  children,
  justify,
  wrap = true,
  gap,
}: {
  children: ReactNode;
  justify?: 'space-between';
  wrap?: boolean;
  gap?: 'xs' | 'sm';
}) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <View
      style={[
        styles.row,
        justify && { justifyContent: justify },
        !wrap && styles.rowNoWrap,
        gap && { gap: t.space[gap] },
      ]}
    >
      {children}
    </View>
  );
}

/** Takes the remaining width in a Row and lets long text wrap instead of pushing siblings off screen. */
export function Grow({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.grow}>{children}</View>;
}

/** A rotation group's colour with its letter, so the group never depends on colour alone. */
export function GroupBadge({ group }: { group: number | undefined }) {
  const t = useTheme();
  const styles = useStyles();
  const full = group === undefined;
  return (
    <View
      style={[styles.groupBadge, { backgroundColor: groupColor(t, group) }]}
      accessibilityLabel={full ? 'Plays the full match' : `Group ${groupLetter(group)}`}
    >
      <Text
        variant={t.component.groupBadge.text}
        style={[styles.groupBadgeText, { color: full ? t.color.pitch.fullTimeLabel : t.color.pitch.groupLabel }]}
      >
        {full ? '–' : groupLetter(group)}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => {
  const c = t.component;
  return {
    screen: { flex: 1, backgroundColor: t.color.bg.canvas },
    screenContent: { padding: c.screen.padding, alignItems: 'center' },
    inner: { width: '100%', maxWidth: c.screen.maxWidth, gap: c.screen.gap },
    card: {
      backgroundColor: t.color.bg.surface,
      borderRadius: c.card.radius,
      padding: c.card.padding,
      gap: c.card.gap,
      borderWidth: c.card.borderWidth,
      borderColor: t.color.border.subtle,
    },
    cardWarning: { backgroundColor: t.color.status.warning.bg, borderColor: t.color.status.warning.bg },
    button: {
      minHeight: c.button.minHeight,
      paddingVertical: c.button.paddingY,
      paddingHorizontal: c.button.paddingX,
      borderRadius: c.button.radius,
      borderWidth: c.button.borderWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: { textAlign: 'center' },
    chip: {
      minHeight: c.chip.minHeight,
      minWidth: c.chip.minWidth,
      paddingHorizontal: c.chip.paddingX,
      borderRadius: c.chip.radius,
      borderWidth: c.chip.borderWidth,
      borderColor: t.color.border.input,
      backgroundColor: t.color.bg.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, alignItems: 'center' },
    rowNoWrap: { flexWrap: 'nowrap' },
    grow: { flex: 1, flexShrink: 1, minWidth: 0 },
    input: {
      minHeight: c.input.minHeight,
      borderWidth: c.input.borderWidth,
      borderColor: t.color.border.input,
      borderRadius: c.input.radius,
      paddingHorizontal: c.input.paddingX,
      paddingVertical: c.input.paddingY,
      backgroundColor: t.color.bg.surface,
      color: t.color.text.primary,
      ...t.typography[c.input.text],
    },
    // An outline on top of the green border, so the focus ring is 2 pt without the text moving.
    // On the web it also replaces the browser's default (blue) focus ring.
    inputFocused: {
      borderColor: t.color.border.focus,
      outlineColor: t.color.border.focus,
      outlineStyle: 'solid',
      outlineWidth: c.input.focusBorderWidth - c.input.borderWidth,
      outlineOffset: 0,
    },
    notice: { padding: c.notice.padding, borderRadius: c.notice.radius, gap: c.notice.gap },
    groupBadge: {
      width: c.groupBadge.size,
      height: c.groupBadge.size,
      borderRadius: c.groupBadge.size / 2,
      borderWidth: c.groupBadge.ringWidth,
      borderColor: t.color.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupBadgeText: { textAlign: 'center' },
  };
});
