@AGENTS.md

# Seen! — repo conventions

- Source of truth: `docs/DESIGN.md`. Do not invent game rules; ask.
- Shared contracts: `lib/board/types.ts`. Do not change without the lead.
- Next.js 16 has breaking changes: read `node_modules/next/dist/docs/` before writing Next code.
- TypeScript strict. Path alias `@/*` → repo root.
- Tests: `npm test` (Vitest, `*.test.ts` next to code), `npm run test:db` (pgTAP in `supabase/tests/`),
  `npm run typecheck`, `npm run lint`. All must pass before a commit.
- E2E: `npm run test:e2e` builds and serves a production bundle on :3006 with `NEXT_PUBLIC_E2E_TEST_HOOKS=1`
  (needs local Supabase + imported pictures). `npm run test:e2e:dev` runs against a running `next dev -p 3001`
  (or `E2E_BASE_URL`). Dev/test surfaces (`/dev/*`, `window.__seenTest`) are gated on `lib/testHooks.ts`;
  never set that flag on a deployed environment. CI: `.github/workflows/ci.yml`.
- Database: migrations in `supabase/migrations/` (timestamped, via `supabase migration new`).
  Apply locally with `supabase db reset`. Local stack is shared — Docker is already running.
- Secrets live in `.env.local` (gitignored). Never commit keys.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- After `supabase db reset`, re-import pictures: `npm run db:import-library` (games can't start without them).
- Worktrees: copy env with `cp /Users/flwahl/Code/seen-game/.env.local .` and run `npm install`.
- Contracts for front end: `docs/API.md` (RPCs, errors, Realtime), `lib/game/types.ts`.
- Dev sign-in (local only): open `/dev/login?email=alice@test.local&name=Alice&next=/` to become that user.
- Pictures: `public/library/v1/` is the live set (owner's art; `manifest.json` holds categories + confusables); `placeholder/` is for dev via `NEXT_PUBLIC_LIBRARY_DIR=placeholder`. Stage explicit paths, not `git add -A`.
- Notifications (M6): `npm run db:setup-notify` stores Vault secrets `notify_url` (→ `host.docker.internal:3004`) and `notify_secret` so the outbox trigger can POST `/api/jobs/notify`; env: `NOTIFY_SECRET`, `APP_URL` (base URL for links; fallback is the request origin), `RESEND_API_KEY` + `EMAIL_FROM` (without a key, email goes by SMTP to Mailpit on `SMTP_PORT`, default 54325), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`. Icons: `npx tsx scripts/make-icons.ts`.
