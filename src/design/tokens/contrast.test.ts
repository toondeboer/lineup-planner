import { describe, expect, test } from 'vitest';
import { contrastRatio } from './contrast';
import { themes } from './themes';

// WCAG 2.2 AA: 4.5:1 for text, 3:1 for the boundaries of controls (1.4.11).
const TEXT = 4.5;
const UI = 3;

describe.each(Object.values(themes))('$scheme theme', (t) => {
  const c = t.color;

  test.each([
    ['primary text on canvas', c.text.primary, c.bg.canvas],
    ['primary text on surface', c.text.primary, c.bg.surface],
    ['primary text on sunken', c.text.primary, c.bg.sunken],
    ['muted text on canvas', c.text.muted, c.bg.canvas],
    ['muted text on surface', c.text.muted, c.bg.surface],
    ['link on surface', c.text.link, c.bg.surface],
    ['link on canvas', c.text.link, c.bg.canvas],
    ['primary button label', c.action.primary.fg, c.action.primary.bg],
    ['primary button label, pressed', c.action.primary.fg, c.action.primary.bgPressed],
    ['secondary button label', c.action.secondary.fg, c.action.secondary.bg],
    ['secondary button label, pressed', c.action.secondary.fg, c.action.secondary.bgPressed],
    ['danger button label', c.action.danger.fg, c.action.danger.bg],
    ['danger button label, pressed', c.action.danger.fg, c.action.danger.bgPressed],
    ['disabled button label', c.action.disabled.fg, c.action.disabled.bg],
    ['selected chip label', c.action.selected.fg, c.action.selected.bg],
    ['success notice', c.status.success.fg, c.status.success.bg],
    ['warning notice', c.status.warning.fg, c.status.warning.bg],
    ['danger notice', c.status.danger.fg, c.status.danger.bg],
    ['danger text on surface', c.status.danger.fg, c.bg.surface],
    ['pitch label on grass', c.pitch.label, c.pitch.grass],
    ['pitch label on stripe', c.pitch.label, c.pitch.stripe],
    ['full-match marker label', c.pitch.fullTimeLabel, c.pitch.fullTime],
  ])('%s reaches 4.5:1', (_, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(TEXT);
  });

  test.each([
    ['input border on surface', c.border.input, c.bg.surface],
    ['secondary button border on canvas', c.action.secondary.border, c.bg.canvas],
    ['focus border on surface', c.border.focus, c.bg.surface],
    ['marker ring on grass', c.pitch.markerRing, c.pitch.grass],
    ['selected marker ring on grass', c.pitch.selected, c.pitch.grass],
  ])('%s reaches 3:1', (_, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(UI);
  });

  test.each(c.pitch.groups.map((g, i) => [i, g]))('group %i label is readable', (_, g) => {
    expect(contrastRatio(c.pitch.groupLabel, g as string)).toBeGreaterThanOrEqual(TEXT);
  });
});
