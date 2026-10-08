# Roadmap

Open work for Lineup Planner, split into product (what coaches get) and technical (how the code holds up).
Each item has a rough **value** (H/M/L) and **effort** (S/M/L). Tick items off here as they land.

_Last reviewed: 2026-10-08._

## Where we are

A working, tested MVP for one amateur 11-a-side team with unlimited substitutions:

- **Squad**: players rated 0–3 for each of 12 positions, stored on the device (AsyncStorage, or localStorage on web).
- **Match setup**: availability, guests (rated quickly from one usual position), 14 formations, choosing keepers
  manually or automatically, and a like-for-like / teammates-may-shift switch.
- **Planner** (`src/core`, pure TypeScript): rotation groups that stay within defence, midfield or attack by
  default (or span lines for the most equal time); fairest rotation groups → fewest minutes at "no" → at "emergency" → at
  "OK" → fewest position shifts. Exact per-group solvers plus a local search across groups. Also pinned starters,
  seeded "Recalculate" and a position-fit summary.
- **Plan screen**: pitch with group colours, a tap to pin a starter, substitutions, bench at kick-off and minutes per player.
- **Sharing**: PNG of the starting XI plus a WhatsApp-formatted message (Web Share API, native share sheet, `wa.me`).
- **Quality**: 143 unit tests on the core, a Playwright smoke test of the web build, CI (typecheck, tests, e2e)
  and a static Vercel deploy.

Still open from the README status table: testing native sharing on a device, and a lint config.

---

## Product roadmap

### Now: make match day reliable

- [ ] **Live match mode** (H / M). The coach uses the app *during* the match, not only before it:
  - match clock (start, pause at half-time), with the next substitution shown in a big card
  - vibration and a local notification shortly before each substitution minute
  - mark a substitution as done; a "who is on the pitch now" view
- [ ] **Re-plan mid-match** (H / L). Handles injuries, a red card, a player arriving late or leaving early. The core
  needs a "plan from minute X with a fixed history" mode that rebalances the remaining minutes. This is the feature
  coaches will miss most once live mode exists.
- [ ] **Per-player constraints** (H / M): "plays the whole match", "max N minutes" (fitness, back from injury),
  "arrives at 30'", "not on the bench at kick-off". It extends `PlanInput`; the group sizing must handle
  players with fixed minutes.
- [ ] **Backup and restore** (H / S). Export and import the squad as a JSON file or share link. Today clearing
  browser data wipes the squad, and moving to a new phone means typing everything again.
- [ ] **Finish the native share device test** (M / S). The test is still pending from M6. Check iOS and Android
  WhatsApp image sharing, then text sharing.

### Next: fairness across a season and a wider audience

- [ ] **Match history and season minutes** (H / M). Save each played plan with its date and opponent. Show each
  player's total minutes, starts and bench-at-kick-off count over the season. Feed this back into the planner so
  whoever started on the bench last week starts this week. This makes fairness visible to players and parents.
- [ ] **Configurable match format** (H / M). Match length (e.g. 2 × 35, 4 × 15 quarters) and team size (6v6, 8v8,
  9v9). Youth football is the largest group of coaches with unlimited substitutions and an equal-minutes rule. The
  core already takes `matchMinutes`, but `OUTFIELD_SLOTS = 10` is hard-coded (see the technical items).
- [ ] **Dutch translation, then more languages** (H / S–M). The main users are likely Dutch amateur clubs. The
  WhatsApp message must be translated too.
- [ ] **Time-line view** (M / M). A row per player showing their positions over 90 minutes (Gantt-style), plus a
  slider to view the pitch at any minute (`lineupAt` already supports this).
- [ ] **Squad editing UX** (M / S):
  - quick-rating presets for squad players (reuse `quickRatings`) instead of 12 × 4 taps
  - confirm before removing a player, then undo
  - edit a guest's ratings and promote a guest to the squad afterwards
  - search and sort when the squad grows past about 20
- [ ] **Better warnings** (M / S). Surface "emergency" minutes per player (not only "no"). Suggest the single rating
  change that would remove a warning ("rate Bram OK at RB to fix 2 warnings").
- [ ] **Install as an app on the web (PWA) and work offline** (M / S). Pitch-side reception is often poor, and most
  coaches will start with the Vercel URL on their phone.

### Later: teams, clubs, distribution

- [ ] **Multiple teams per coach** (M / M), e.g. a coach who runs both the first team and a youth team.
- [ ] **Cloud sync and shared squads** (M / L). An account, sync across devices, and a co-coach who can edit. It
  needs a backend (e.g. Supabase), auth, and a privacy policy because the app holds names of minors in youth football.
- [ ] **Collect availability from players** (M / L). Share a link in the team WhatsApp; players tap "in" or "out",
  and the match tab fills itself.
- [ ] **Printable team sheet / PDF** (L / S) for the dressing room or the referee.
- [ ] **Drag and drop on the pitch** to swap starters, and pin a whole rotation group (L / M).
- [ ] **App Store / Play Store release** (M / M). This covers bundle ID and package name, `eas.json`, store
  listing, screenshots, privacy label and EAS Update channels.
- [ ] **Business model** (to decide). Free for one team; a paid "club" tier (many teams, sync, season stats) once
  cloud sync exists.

---

## Technical roadmap

### Performance (do first; it affects every screen)

- [x] **Take plan generation off the critical render path** (H / M). `usePlan` now:
  - caches plans by input, so the Plan tab and the Share modal share one computation
  - no longer replans on an unfocused screen, so the Plan tab stays idle while the Match tab is edited
  - makes the plan in a deferred render (`useDeferredValue`) and shows "Updating the plan…" meanwhile

- [x] **Performance budget test** (M / S). `src/core/performance.test.ts` fails when a worst-case squad (11–20
  outfield players, pins, recalculate) takes more than 3 s, in both rotation modes. Tighten the budget once
  the planner is faster.
- [ ] **Make the "equal" rotation faster** (M / M). The default per-line rotation stays under 75 ms with random
  ratings (Node on Apple silicon, JIT). The "equal" rotation, where groups span lines, takes 25–610 ms, and
  **pinning three starters with 12 outfield players takes ~1.1 s**. A phone (Hermes, no JIT) is likely several
  times slower. Starting points:
  - the pin-aware moves in `optimise` try every slot × member combination
  - 24 restarts when only one group sizing is a candidate
  - the full `solveGroup` re-solve for every candidate swap

  Then time `generatePlan` on a mid-range Android device. If it still blocks noticeably, move it off the JS thread
  (a Web Worker on web).

### Code quality and architecture

- [ ] **Lint and format** (M / S). Run `npx expo lint` to create the ESLint config, add Prettier, and add both to CI.
  This was already listed as open in the README.
- [ ] **Remove hard-coded 11-a-side** (H / M; required for match formats). `OUTFIELD_SLOTS = 10` is used in
  `groups.ts`, `summary.ts` and `generate.ts`. Derive it from the formation instead, add formations per team size,
  and parameterise the group sizing (`2 * OUTFIELD_SLOTS` limit).
- [ ] **Split `generate.ts`** (M / S). It holds goalkeeper choice, validation, the local search, the RNG helpers and
  plan assembly with derived stats. Move them to `search.ts`, `random.ts` and `planStats.ts` (minutes, fit,
  warnings). The pin-aware move in `optimise` copies the accept-move logic of the generic moves; extract a shared
  `tryMove`.
- [ ] **Deduplicate screen logic** (M / S). `plan.tsx` and `share.tsx` both build `groupOfSlot` and the pitch
  markers. The fallback colour `#263238` is hard-coded three times. Add a `pitchMarkers(plan, formation, players)`
  helper and a `colors.fullTime` theme token. Split `plan.tsx` (170 lines) into `FitSummary`,
  `SubstitutionList`, `MinutesList` and `PinPicker` under `src/ui/plan/`.
- [ ] **Typed planner errors** (M / S). The core throws English strings that the UI shows as they are
  (`usePlan` → `error`). Use error codes with parameters so the UI can explain them, suggest a fix, and translate them.
- [ ] **Persistence migrations and validation** (H / S). The store is at `version: 1` with a catch-all `merge`. Add
  an explicit `migrate` per version and validate the loaded shape. This must happen before match history or
  multi-team changes the schema, or existing users lose data.
- [ ] **Store shape for the future** (M / M). Today there is one `squad` and one `match`. Plan for
  `teams[] → squad, matches[]` (with saved plan snapshots) before building history or multiple teams.
- [ ] **IDs** (L / S). `newId` uses `Math.random().toString(36)` (8 chars). Switch to `expo-crypto`'s
  `randomUUID` before IDs are synced or shared between devices.
- [ ] **Routing details** (L / S). New players open `/player/<random id>`, so any deep link creates a player. Use
  `/player/new`, and show "not found" for unknown IDs.
- [ ] **Dependency hygiene** (L / S). `expo-doctor` reports patch mismatches (`expo`, `expo-constants`,
  `expo-linking`, `expo-router`); run `npx expo install --fix`. Add `expo-doctor` to CI.

### Testing

- [ ] **Property-based tests for the planner** (H / S). Use `fast-check` with random squads, ratings, pins and
  formations, and check these invariants:
  - every slot is filled at every minute
  - minutes match the group shares
  - pins are honoured
  - strict mode never moves a teammate
  - a seed never makes the fit worse

  These invariants are what users trust, and the search code is the riskiest part of the codebase.
- [ ] **Store tests** (M / S). Unit-test the Zustand actions (pin dedupe, `withoutPlayer`, guest save,
  migrations) without React.
- [ ] **Component tests** (M / M). Add React Native Testing Library for the screens. The project uses vitest for the
  core, so decide between `jest-expo` for UI only or vitest with a React Native preset.
- [ ] **Wider e2e** (M / S). The smoke test seeds localStorage and covers Plan and Share only. Add the flow from an
  empty app: add players → select availability → see the plan. Consider Maestro for native flows.

### Platform and delivery

- [ ] **EAS setup** (M / S). Add `eas.json` (development, preview and production profiles),
  `ios.bundleIdentifier`, `android.package`, and EAS Update channels.
- [ ] **Error reporting** (M / S). Export an `ErrorBoundary` from the route layouts and add crash reporting (e.g.
  Sentry) before a store release.
- [ ] **Dark mode** (L / S). Set `userInterfaceStyle: "automatic"` and add a dark palette to `theme.ts`. Coaches
  use the app in evening matches.
- [ ] **Accessibility** (M / S). Tab icons (currently hidden via `tabBarIconStyle`), check that the pitch slots' labels
  reach native screen readers (they are SVG `G` elements, verified on web only), font scaling on the pitch text, and colour-blind
  safe group colours (red and green groups on a green pitch).
- [ ] **CI speed** (L / S). Cache the Playwright browsers, and run the e2e job only after unit tests pass.

---

## Suggested order

1. Lint, and time the planner on a real phone (the "equal" rotation first).
2. Backup and restore, plus persistence migrations (protect user data before the schema grows).
3. Live match mode, then mid-match re-planning (the biggest match-day value).
4. Configurable match format (with the 11-a-side generalisation) and Dutch translation (widens the audience).
5. Match history and season minutes, then multiple teams, sync and a store release.
