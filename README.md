# Seen!

A phone-first web game where 2–6 friends take turns finding one picture among
200–500 on a shared board. Lowest total time wins. Play is asynchronous: a game
can stretch over days, and the time between turns never counts.

Live at <https://seen.imjustbored.com>.

## How a turn works

Tap **Draw** → the target picture is revealed for 1.2 s → the clock starts and
the board appears → pan, zoom and tap the match. A wrong tap adds 5 s; a round
is capped at 90 s. Everyone plays the same number of rounds (5, 10 or 20), and
the lowest total wins. Players get a push or email reminder after 24 h and
forfeit the turn after 72 h.

Game settings: board size (200, 300, 500), rounds per player, monochrome mode,
and grid or scattered layout. Full rules: [`docs/DESIGN.md`](docs/DESIGN.md).

## Stack

- [Next.js 16](https://nextjs.org) (App Router, React 19, Tailwind 4), PWA via Serwist
- [Supabase](https://supabase.com): Postgres + RPCs, Auth (magic link, Google), Realtime
- Email: Resend (prod) or SMTP to Mailpit (local); Web Push via VAPID
- Tests: Vitest, pgTAP, Playwright
- Hosting: Vercel

## Getting started

Prerequisites: Node 24, Docker, the [Supabase CLI](https://supabase.com/docs/guides/local-development).

```sh
npm install
supabase start                 # local Postgres, Auth, Realtime, Mailpit
supabase db reset              # apply migrations
```

Create `.env.local` (gitignored, never commit it) from `supabase status -o env`:

```sh
NEXT_PUBLIC_SUPABASE_URL=...           # API_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... # PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=...                # SECRET_KEY
NOTIFY_SECRET=...                      # any random string
APP_URL=http://localhost:3000
EMAIL_FROM="Seen! <noreply@localhost>"
# Optional: RESEND_API_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
```

Then import the pictures (games can't start without them; repeat after every
`supabase db reset`) and run the app:

```sh
npm run db:import-library
npm run db:setup-notify        # optional: lets the DB outbox call /api/jobs/notify
npm run dev
```

Sign in locally without email at
`/dev/login?email=alice@test.local&name=Alice&next=/`. Magic-link emails land in
Mailpit (<http://localhost:54324>).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js (each rebuilds the picture library first) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route typegen + `tsc --noEmit` |
| `npm test` | Vitest unit tests (`*.test.ts` next to the code) |
| `npm run test:db` | pgTAP tests in `supabase/tests/` |
| `npm run test:e2e` | Playwright against a production build on :3006 with test hooks on |
| `npm run test:e2e:dev` | Playwright against a running `next dev -p 3001` (or `E2E_BASE_URL`) |
| `npm run db:import-library` | Load `public/library/v2/` pictures into the database |
| `npm run db:setup-notify` | Store local Vault secrets for the notification outbox |

Lint, typecheck, unit and DB tests must pass before a commit. CI
(`.github/workflows/ci.yml`) runs all of them plus e2e on every PR.

## Layout

```
app/          routes: home, /new, /g/[id] (lobby, play, results), /join/[token],
              /profile, /signin, /api/jobs/notify, /dev/* (local only)
components/   UI
lib/board     board generation (shared contracts in types.ts)
lib/game      game client types and helpers
lib/notify    email + push delivery
lib/library   picture manifest
supabase/     migrations and pgTAP tests
public/library/v2/   the live picture set (750 SVGs + manifest.json)
e2e/          Playwright specs
docs/         DESIGN.md (rules, source of truth), API.md (RPCs, errors, Realtime), DEPLOY.md
```

Dev and test surfaces (`/dev/*`, `window.__seenTest`) are gated on
`NEXT_PUBLIC_E2E_TEST_HOOKS` via `lib/testHooks.ts`. Never set it on a deployed
environment.

## Deploying

Every push to `main` deploys to Vercel. Database migrations, Vault secrets and
auth settings are applied by hand; see [`docs/DEPLOY.md`](docs/DEPLOY.md).
