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

### Per line (default) or most equal time

The Match tab has a **Rotation groups** switch.

- **Per line** (default, `rotation: 'lines'`): every group stays within defence, midfield or attack, so the
  players of a line can arrange their own swaps without a coach. Among splits where nobody plays more than a
  quarter of the match longer than a teammate, the one with the fewest substitution moments wins (ideally all
  groups swap together); then the fairest. Places in a line that no group covers go to full-time players.
  Example: 14 players in a 4-3-3 → defence 4 rotating + 1 full match, midfield 4, attack 4, all swapping at
  22', 45', 67'. The split per line is in `lineSizings` (`src/core/lines.ts`).
- **Most equal time** (`rotation: 'equal'`): the fairest split overall (14 players → 5+4+4, mixing lines when
  that fits the ratings better), at the cost of more substitution moments.

## How positions are assigned

Players carry a rating per position: 3 preferred, 2 OK, 1 emergency, 0 "no". The planner
(`generatePlan` in `src/core/generate.ts`) works through these priorities, strictly in this order, so a
lower one can never override a higher one:

1. **Playing time.** The squad is split into rotation groups as described above (per line or most equal), with
   substitutions only at the fixed windows (15', 22', 30', 45', 60', 67', 75' ...).
2. **Fewest minutes at a position rated "no".**
3. **Fewest minutes at "emergency", then at "OK"**, so a 3 is preferred over a 2.
4. **Position shifts.** A teammate may change position at a substitution when that removes a "no" or an
   "emergency" position, but not just to upgrade a 2 to a 3. Turn shifts off with "Like-for-like only" on
   the Match tab. (Groups of 6, which only happen with 11 or 12 outfield players, always swap like-for-like.)

Ties are broken by keeping a group's positions close together on the pitch. The search is deterministic.

**Recalculate** gives a different plan of the same quality: it adds a tiny seeded nudge that can only choose
between plans that are equal on all of the priorities above. Pinned starters are kept.

The Plan tab shows the share of player-minutes at each rating. Zeros that remain are usually a squad
problem: a group needs a bench player who can cover its positions, so rating a player for more positions
(or adding a versatile guest) is the way to remove them.

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

## Shared teams backend (AWS)

Coaches can share a team through a secret invite link (work in progress, see
[docs/plans/shared-teams.md](docs/plans/shared-teams.md)). The backend in `server/` is one Lambda function behind
a function URL, on one DynamoDB table in eu-central-1, sized to stay within the AWS free allowances. The
infrastructure is in [infra/template.yaml](infra/template.yaml) (AWS SAM).

### Deploy

Needs the AWS CLI signed in to the account and the SAM CLI.

1. Check that no other DynamoDB tables in eu-central-1 use the free capacity (25 read and 25 write units are
   shared by all tables in a region; this table takes 5 + 5):
   `aws dynamodb list-tables --region eu-central-1`
2. Build and deploy (the first time with `--guided`, which saves the answers to `samconfig.toml`, gitignored):

   ```bash
   npm --prefix server ci
   npm --prefix server run build
   sam deploy --guided --template-file infra/template.yaml --stack-name lineup-planner \
     --region eu-central-1 --capabilities CAPABILITY_IAM --resolve-s3
   ```

   Parameters: `AlertEmail` (monthly cost alert, account-wide), `AlertAmountUsd` (default 1) and
   `AllowedOrigins` (the Vercel URL plus `http://localhost:8081`, comma separated).
3. Check the live API (creates two test teams and deletes them again):
   `API_URL=<ApiUrl output> ORIGIN=<Vercel URL> node server/scripts/smoke.mjs`
4. Put the `ApiUrl` output in `EXPO_PUBLIC_API_URL`, in a local `.env` and in Vercel's environment variables.

Later deploys: `npm --prefix server run build && sam deploy` (reads `samconfig.toml`). The table has deletion
protection and is kept if the stack is deleted.

### Local API

```bash
npm --prefix server run dev                     # API on http://localhost:3001, in memory
docker run --rm -p 8000:8000 amazon/dynamodb-local
DYNAMODB_ENDPOINT=http://localhost:8000 npm --prefix server run dev            # ... on DynamoDB Local
TEST_REPO=dynamodb DYNAMODB_ENDPOINT=http://localhost:8000 npx vitest run server  # API tests on DynamoDB Local
```

## Development

```bash
npm install
npm --prefix server install   # the shared-teams server (needed for the typecheck)
npm test            # unit tests for the core module and the server (vitest)
npm run typecheck
npm run e2e         # export the web build and run the Playwright smoke test (needs Chromium)
npm run web         # start the Expo dev server for web (also: npm run ios / android)
```

The planning logic lives in `src/core` and is pure TypeScript with no React or Expo imports.
