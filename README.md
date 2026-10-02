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

## Status

| Milestone | State |
|---|---|
| M0 Scaffold, CI | done |
| M1 Formations, group sizing, windows | done |
| M2 Slot assignment and full plan generation | next |
| M3 Manual overrides and recalculation | |
| M4 Squad and match setup screens | |
| M5 Plan screen | |
| M6 WhatsApp sharing | |
| M7 Polish | |

## Development

```bash
npm install
npm test            # unit tests for the core module (vitest)
npm run typecheck
npm run web         # start the Expo dev server for web (also: npm run ios / android)
```

The planning logic lives in `src/core` and is pure TypeScript with no React or Expo imports.
