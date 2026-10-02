# Lineup Planner

Football lineup and substitution planner for amateur teams with unlimited substitutions.
Goal: everyone plays roughly equal time, while respecting preferred positions, with
occasional guests. Targets web, iOS and Android from one Expo (TypeScript) codebase.

## How the rotation works

- 11-a-side, 2 × 45 minutes. The goalkeeper is fixed and not part of the rotation
  (two keepers play a half each), so 10 outfield places rotate.
- Outfield players are bundled into groups of 3 or 4 (sometimes 2, or up to 6 for small squads).
  A group of size `g` covers `g - 1` places, so one member is always on the bench and everyone
  plays `(g - 1) / g` of the match: ½, ⅔, ¾ (or 4/5, 5/6 for small squads).
- With N outfield players there are N − 10 groups. Mixed sizes are fine (14 players = 4+4+3+3).
- Substitutions happen at even fractions of the match, rounded down: groups of 4 swap at
  22', 45', 67'; groups of 3 at 30', 60'; groups of 2 at half-time; groups of 6 every 15'.

## How positions are assigned

Players carry a rating per position (3 preferred, 2 comfortable, 1 emergency, 0 unsuitable).
`generatePlan` (in `src/core/generate.ts`) splits the 10 outfield places into groups, hands each
group a set of nearby places and a set of players, and lets a substitute always take over the
place of the player going off. It minimises minutes spent at poor ratings (with a small
preference for groups that stay in one area of the pitch). The search is deterministic, so the
same squad always gives the same plan. Anyone unavoidably playing at a rating of 0 is reported
in `plan.warnings`.

Goalkeepers: players rated 3 for GK (at most two) are the keepers; if nobody is, the best rated
player is. Pass `goalkeeperIds` to choose explicitly.

## Manual overrides

`generatePlan({ ..., pinned: { ST: 'p5', CB1: 'p9' } })` forces those players to start in those
slots (pin all 11 slots to force a complete starting XI). The groups, rotation order and
substitution minutes are then recalculated around them: the players you leave out of the
starting XI become the substitutes, one per group. Pinning a slot to a keeper chooses who
starts in goal.

## Sharing

The Plan tab has a **Share lineup** button. The share screen renders the starting XI as a PNG
(via `react-native-svg`'s `toDataURL`) and builds a WhatsApp message with the substitutions and
their minutes (`formatShareMessage` in `src/core/format.ts`).

- Web on a phone: image and text are shared together through the Web Share API when the browser
  supports sharing files. On desktop the PNG is downloaded and the text can be copied or opened
  in WhatsApp via a `wa.me` link.
- iOS / Android: the image goes through the system share sheet (pick WhatsApp). Share the text
  as a second step, since WhatsApp does not reliably accept a picture and a caption in one share.

## Deploying the web app (Vercel)

`vercel.json` is set up for a static deploy: it builds with `npx expo export --platform web`,
serves `dist/`, and rewrites unknown paths to `index.html` so refreshing `/plan` works.

1. In Vercel choose **Add New > Project** and import this GitHub repository (free Hobby plan).
2. Keep the detected settings (they come from `vercel.json`) and deploy.
3. Every push gets a preview URL; the default branch becomes the production URL.

Or from a terminal: `npx vercel` (preview) / `npx vercel --prod`.

Squad data is stored in the browser's local storage, so each browser starts with an empty squad.

## Status

| Milestone | State |
|---|---|
| M0 Scaffold, CI | done |
| M1 Formations, group sizing, windows | done |
| M2 Slot assignment and full plan generation | done |
| M3 Manual overrides and recalculation | done |
| M4 Squad and match setup screens | done |
| M5 Plan screen | done |
| M6 WhatsApp sharing | done (device test pending) |
| M7 Web smoke test (e2e) | done |
| Device test of native share, lint config | open |

## Development

```bash
npm install
npm test            # unit tests for the core module (vitest)
npm run typecheck
npm run e2e         # export the web build and run the Playwright smoke test (needs Chromium)
npm run web         # start the Expo dev server for web (also: npm run ios / android)
```

The planning logic lives in `src/core` and is pure TypeScript with no React or Expo imports.
