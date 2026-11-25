# Plan: shared teams (AWS: DynamoDB + Lambda, invite link)

_Status: draft, 2026-11-25. Covers the ROADMAP item "Cloud sync and shared squads"._

## Goal

A coach can share their squad with the other coaches of the team. Anyone who joins can edit players,
ratings and the upcoming match (availability, guests, formation, keepers, pins) and make line-ups. Changes
show up on the other phones within seconds. Nobody needs a username or password.

People who never share keep using the app exactly as they do today: local only, no network.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Hosting | AWS, **eu-central-1** (Frankfurt), on the existing account | Uses only the free allowances (below), never pauses for inactivity, and keeps EU data in the EU. |
| Database | **DynamoDB**, one table, **provisioned** capacity of 5 read and 5 write units, auto scaling **off** | The free allowance (25 RCU, 25 WCU, 25 GB a month) covers provisioned mode only. With fixed capacity, a burst of traffic is slowed down instead of billed. |
| API | **One Lambda function with a function URL** (Node.js, TypeScript, arm64) | 1M requests a month are free. No API Gateway, whose free tier only lasts 12 months. |
| Identity | A **member token** per device, issued when the device creates or joins a team | No Cognito and no signup. The app sends the token with every request. The table stores only its SHA-256 hash. |
| Access | A **secret invite link** per team (128-bit random code) | Can't be guessed, any member can reset it, joining takes one tap. |
| Who can edit | All members are equal editors in v1 | Matches "anyone can update". No team ends up orphaned when one coach loses their phone. |
| What is shared | Squad **and** the upcoming match | Agreed. When two coaches change the same part at the same time, the last write wins. |
| Seeing others' changes | **Polling**: a cheap version check every 15 s while the app is open and visible, and on returning to the app | WebSockets (API Gateway) are only free for 12 months. With 2 or 3 coaches, a few seconds' delay is fine. |
| Local data | The Zustand store is what the UI reads and works as an offline cache | Planner, screens and tests don't change. Pitch-side reception is poor. |
| Teams per device | One active team in v1 | "Multiple teams per coach" is a separate roadmap item; the table already supports it. |

**Expected cost: $0 a month.** Two safety nets are part of the infrastructure template:

- An AWS Budget with an email alert at **$1**.
- A cap of **5 concurrent copies** of the Lambda function.

Charges beyond the free allowances would be tiny anyway: $0.20 per extra million Lambda requests, and
DynamoDB can't grow its bill from traffic because its capacity is fixed.

## DynamoDB table `lineup-planner`

One table with a partition key `pk` and a sort key `sk`, both strings. It has no secondary indexes, which
would use capacity of their own. Deletion protection is on.

| Item | pk | sk | Attributes |
|---|---|---|---|
| Team | `TEAM#<teamId>` | `META` | `name`, `inviteCode`, `version` (number), `createdAt` |
| Member | `TEAM#<teamId>` | `MEMBER#<memberId>` | `displayName`, `joinedAt`, `lastSeenAt` |
| Player | `TEAM#<teamId>` | `PLAYER#<playerId>` | `name`, `ratings` (map), `isDemo`, `updatedAt` |
| Match | `TEAM#<teamId>` | `MATCH` | `state` (map: `availableIds`, `guests`, `formationId`, …), `updatedAt` |
| Invite lookup | `INVITE#<code>` | `INVITE` | `teamId` |
| Token lookup | `TOKEN#<sha256(token)>` | `TOKEN` | `teamId`, `memberId` |

- **Every write bumps the team version** (`ADD version :1` on `META`), in the same `TransactWriteItems` call as the change.
- **A poll reads only `META`**: one eventually consistent `GetItem`, which is half a read unit. Only when the version has changed does it `Query` the whole team (`pk = TEAM#id`). That's a few KB for a full squad, so a few read units.
- **Resetting the invite** deletes the old `INVITE#` item and writes a new one.
- **Removing a member** deletes their `MEMBER#` and `TOKEN#` items, so their token stops working right away.
- **When the last member leaves**, every item of the team is deleted.

## API (one Lambda, a small hand-written router)

Every route except the first three needs `Authorization: Bearer <memberToken>`. The handler hashes the
token, gets the `TOKEN#` item, and from then on only touches that team's items. A request can never name
another team.

| Route | What it does |
|---|---|
| `POST /teams` `{ name, displayName, squad, match }` | Creates a team from the local squad. Returns `{ teamId, inviteCode, token, version }`. |
| `GET /invites/:code` | Preview for the join screen: `{ teamName, playerCount, memberCount }`. Unknown code → 404. |
| `POST /invites/:code/join` `{ displayName }` | Adds a member. Returns `{ teamId, token, version }`. |
| `GET /team?since=<version>` | Returns `{ unchanged: true }` if the version is the same; otherwise the full team: name, invite code, members, players, match and version. Updates `lastSeenAt` at most once an hour. |
| `PUT /players/:id` / `DELETE /players/:id` | Upsert or remove a player. Removing a player also removes them from the match (as `withoutPlayer` does locally). |
| `PATCH /match` `{ formationId?, availableIds?, guests?, … }` | Sets only the fields sent (`SET state.#k = :v`), so one coach changing the formation and another changing guests don't overwrite each other. |
| `PATCH /team` `{ name }` | Renames the team. |
| `POST /team/invite` | Resets the invite link and returns the new code. |
| `DELETE /members/:memberId` | Removes a member, or yourself when you leave. The last member leaving deletes the team. |
| `DELETE /team` `{ confirmName }` | Deletes the team for everyone. |

- **Validation:** body at most 64 KB; names 1–60 characters; at most 60 players; ratings 0–3 for known
  roles only; `MatchState` shape checked. Errors come back as `{ error }` with 400, 401, 404 or 409.
- **CORS:** allow only the Vercel domain and `http://localhost:8081`. Native apps send no `Origin`
  header, so CORS doesn't affect them.
- **Logging:** never log tokens, invite codes or player names.

## Code layout

```
server/                      own package.json, so AWS SDK code stays out of the app bundle
  src/api.ts                 router, routes and error mapping (pure: request in, response out)
  src/lambda.ts              function URL adapter; CORS is configured on the function URL
  src/auth.ts                token creation and hashing, invite codes (crypto.randomBytes)
  src/model.ts               item types and the Repo interface for the table operations above
  src/dynamoRepo.ts          DynamoDB implementation (@aws-sdk/lib-dynamodb)
  src/memoryRepo.ts          in-memory implementation for tests
  src/validate.ts
  test/*.test.ts             vitest (run by the root `npm test`): every route against MemoryRepo, incl. access denied
infra/template.yaml          AWS SAM: table, function + URL, cap of 5 copies, budget alert, outputs the URL
src/sync/api.ts              typed fetch client; EXPO_PUBLIC_API_URL; isCloudEnabled()
src/sync/diff.ts             pure: previous/next store state -> player upserts/deletes, changed match fields
src/sync/sync.ts             sync engine (below)
src/app/team.tsx             modal: create team / invite link, members, reset link, leave, delete
src/app/join/[code].tsx      preview -> "Your name" -> Join
```

`Player`, `Role` and `Rating` come from `src/core/types.ts`. `MatchState` moves from `src/state/store.ts`
to `src/core` so that both the app and the server can import it.

## Client

### Changes to existing files

- `src/state/store.ts`:
  - Add persisted `team: { id, name, inviteCode, token, version } | null`.
  - Add persisted `sync: { dirtyPlayerIds, deletedPlayerIds, dirtyMatchKeys }`.
  - Add `replaceAll(squad, match)` for applying the server's data.
  - Bump `version` to 2 and keep the `merge` back-compatible.
  - Existing actions stay as they are.
- `src/app/_layout.tsx`: register the `team` and `join/[code]` screens; start the sync engine.
- `src/app/(tabs)/index.tsx`: a "Share with team" button, or the team name and sync status once shared.
- If `EXPO_PUBLIC_API_URL` is missing, the sharing UI is hidden. CI, e2e and forks keep working with no backend.
- The token is kept in AsyncStorage (localStorage on web). Moving it to `expo-secure-store` on native is a later step.

### Sync engine

1. **Start** (app launch or join, when `team` is set): `GET /team?since=0`, apply local dirty changes on
   top, then `replaceAll`.
2. **Local edit**: `useStore.subscribe((next, prev) => …)` runs `diff.ts` and marks items dirty. A
   debounced flush (~300 ms) sends `PUT`/`DELETE /players` and `PATCH /match`. Each success clears its
   dirty flag and stores the returned version. The UI never waits for the network.
3. **Polling**: every 15 s while the app is open and visible (`AppState` on native, `visibilitychange` on
   web), and right away when the app returns to the foreground. If the team has changed, merge it into the
   store, keeping items that are still dirty locally (their local write wins when it flushes). Use an
   `applyingRemote` guard so the merge isn't pushed back.
4. **Offline**: a failed flush keeps the dirty flags (persisted) and retries on the next poll.
5. **401 (removed) or 404 (team deleted)**: show "You're no longer in this team", keep a local copy of the
   squad, and return to local-only mode.

Rough usage: 3 coaches × 1 hour with the app open × 240 polls ≈ 720 requests per match day. That's far
below 1M Lambda requests and 5 read units.

Known limitation: `availableIds` is one field, so two coaches toggling different players at the same
second could lose one toggle. Both see the result within 15 s. If it matters, store availability per
player.

## Security and privacy checklist

- Tokens: 32 random bytes; only the SHA-256 hash is stored; revoked by deleting the `TOKEN#` item.
- Invite codes: 16 random bytes (hex); reset in one tap; they only allow joining, nothing else.
- Every handler loads the team from the token, never from the request. Unit tests confirm a token for
  team A gets 401 or 404 for anything of team B.
- No AWS credentials in the app. The function's IAM role can only access this one table.
- Cost safety: fixed DynamoDB capacity, a cap of 5 Lambda copies, the $1 budget alert.
- Product copy: "Anyone with this link can see and edit the squad, including ratings. Share it with
  coaches only." Add a short privacy policy page (names of minors, EU hosting, how to delete a team)
  before wider release.
- Losing access: clearing browser data or changing phones loses the token. The coach opens the invite link
  again and rejoins. The members list shows when each member was last seen, so old devices can be removed.

## What you need to do

1. Install the AWS CLI and SAM CLI, and sign in to your existing account locally (`aws configure` or `aws sso login`).
2. Check that no other DynamoDB tables in **eu-central-1** already use the free capacity. The 25 RCU/WCU
   allowance is shared by all tables in a region. Also check that the account's Lambda concurrency limit is
   the usual 1,000; the cap of 5 copies needs room to be reserved.
3. Deploy: `sam build && sam deploy --guided --region eu-central-1`, giving the email address for the
   budget alert. I can prepare everything, but the deploy is yours to run or to tell me to run.
4. Put the function URL from the deploy output in `EXPO_PUBLIC_API_URL`: in a local `.env` (gitignored)
   and in Vercel's environment variables.

## Build order (each step is a reviewable commit or PR)

1. **Server**: router, auth, validation, repo interface, in-memory repo, and route tests including
   access-denied cases. _(M)_
2. **Infrastructure**: SAM template, DynamoDB repo, a deploy guide in the README, and a smoke script that
   checks the deployed API (create, join, edit, a stranger is refused, delete). You deploy. _(S)_
3. **Client plumbing**: API client, env guard, store fields with a migration test, `MatchState` moved to `core`. _(S)_
4. **Create, join and leave screens**, with an invite link that opens `/join/<code>` on the web. _(M)_
5. **Sync engine**: `diff.ts` with vitest tests, flush, polling, offline retry. _(L)_
6. **Polish**: sync status, members list with last seen, reset and remove, privacy copy, README and ROADMAP. _(S)_

Checks for every step: `npx tsc --noEmit`, `npx expo lint`, `npm test` (app and server), and the e2e
smoke test (runs with no backend). Test end to end with two browsers, then two phones, on the same team.

## Later (not in v1)

- Native app links (`https://…/join/…` opening the installed app needs associated domains). Until then,
  native users open the link in the browser or paste the code.
- A read-only link for players, for example to collect availability (separate roadmap item).
- Token in `expo-secure-store` on native; an owner role if a team wants one; several teams per device.
- DynamoDB TTL to clean up teams nobody has opened for a year.
