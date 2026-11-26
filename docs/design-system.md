# Design system

One set of tokens styles the web app and the iOS and Android apps. Screens never contain a raw
colour, font size or font name: they ask the theme for a role (`color.text.muted`,
`space.md`, `<Text variant="heading">`), and the theme answers for light or dark.

**Look:** "Touchline", a calm deep grass green with green-tinted greys, set in Inter. It is meant
to be readable at a glance on the sideline, in sunlight and at evening matches.

## Token layers

| Layer | File | What it holds | Who reads it |
|---|---|---|---|
| 1. Primitives | `src/design/tokens/primitives.ts` | Raw values: colour ramps, group colours, font files, spacing and radius scales | Only the layers below and `scripts/generate-icons.mjs` |
| 2. Semantic | `src/design/tokens/themes.ts` | Roles with a light and a dark value: `bg.canvas`, `text.muted`, `action.primary.bg`, `status.warning`, `pitch.grass`, the type scale | Screens and components, through `useTheme()` / `makeStyles()` |
| 3. Component | `src/design/tokens/components.ts` | Per-component decisions: button height, chip padding, input focus border, pitch marker sizes | `src/ui/components.tsx`, `src/ui/Pitch.tsx` |

To change the look, change a primitive or the semantic mapping. Screens follow automatically.

## Using it

```tsx
import { makeStyles, useTheme } from '../design';
import { Button, Card, Row, Text } from '../ui/components';

const useStyles = makeStyles((t) => ({
  minute: { minWidth: t.space.xxl + t.space.sm },
}));

function Example() {
  const styles = useStyles();       // cached per theme
  const t = useTheme();             // when a value is needed outside a style
  return (
    <Card>
      <Text variant="heading">Substitutions</Text>
      <Text tone="muted" tabular style={styles.minute}>22'</Text>
    </Card>
  );
}
```

- **Text**: always `Text` from `ui/components` with a `variant` (`display`, `title`, `heading`,
  `body`, `bodyStrong`, `small`, `label`, `caption`, `overline`) and an optional `tone`
  (`muted`, `link`, `success`, `warning`, `danger`). Use `tabular` for minutes and other numbers in columns.
- **Components**: `Screen`, `Card` (also `tone="warning"`), `Button` (`primary`, `secondary`,
  `danger`), `ConfirmButton`, `Chip`, `TextField`, `Notice`, `Row`, `Grow`, `GroupBadge`.
- **Layout**: `Row` with `justify`, `wrap` and `gap`; `Grow` for the part of a row that should take
  the remaining width and wrap long text.

## Rules (enforced)

`npm run lint` fails on these; CI runs it.

- No hex or `rgb()`/`hsl()` colours anywhere in `src/` except `src/design/tokens`.
- In screens (`src/app`): no inline `style={{…}}` objects, no `fontSize`/`fontWeight`/`fontFamily`/
  `lineHeight`/`letterSpacing`, and no `Text`, `TextInput` or `StyleSheet` from `react-native`.
- `src/design/tokens/contrast.test.ts` checks every text and control pair in both themes against
  WCAG 2.2 AA (4.5:1 for text, 3:1 for control borders). A new colour pair belongs in that test.
- `src/design/tokens/appConfig.test.ts` keeps `app.config.ts` (which cannot import app code) in sync
  with the app name and the token colours.

## Accessibility decisions

- Every pressable element is at least 44 × 44 pt (`size.touchTarget`).
- Pressed states change colour instead of fading, so they stay visible in sunlight.
- Rotation groups have a letter as well as a colour (`GroupBadge`), so colour is never the only signal.
  Group discs on the pitch have a white ring: on their own they barely differ from the grass.
- Players who play the whole match get a white disc with a dark label.
- `Title` and `Heading` are announced as headings by screen readers.

## Themes and fonts

- The theme follows the device setting (`userInterfaceStyle: "automatic"`; Android needs
  `expo-system-ui`). `DesignProvider` passes the theme to Expo Router's headers and tab bar and paints
  the root view in the canvas colour.
- Inter 400, 600 and 700 load at runtime with `useFonts` (works in Expo Go and on the web); the splash
  screen stays up until they are ready. If loading fails the app uses the system font, with weights
  instead of font families.
- The shared lineup image always uses the light pitch and a system font stack (`font.svg`), so it
  looks the same whatever theme the sender has, and the browser can rasterise it without web fonts.

## App icon and splash

`npm run icons` draws the "Centre circle" mark and writes `assets/icon*.png`,
`android-icon-*.png`, `splash-icon*.png` and `favicon.png` from the tokens (Node 22.18+).
The iOS dark icon is transparent; iOS draws its own background behind it.

## Not decided yet

- The app's final name. It lives in `src/config/app.ts` (`APP_NAME`) and `app.config.ts` (`NAME`).
  The URL scheme and storage key stay `lineup-planner` so invite links and saved squads keep working.
