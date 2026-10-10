@AGENTS.md

# Seen! — repo conventions

- Source of truth: `docs/DESIGN.md`. Do not invent game rules; ask.
- Shared contracts: `lib/board/types.ts`. Do not change without the lead.
- Next.js 16 has breaking changes: read `node_modules/next/dist/docs/` before writing Next code.
- TypeScript strict. Path alias `@/*` → repo root.
- Tests: `npm test` (Vitest, `*.test.ts` next to code), `npm run test:db` (pgTAP in `supabase/tests/`),
  `npm run typecheck`, `npm run lint`. All must pass before a commit.
- Database: migrations in `supabase/migrations/` (timestamped, via `supabase migration new`).
  Apply locally with `supabase db reset`. Local stack is shared — Docker is already running.
- Secrets live in `.env.local` (gitignored). Never commit keys.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- After `supabase db reset`, re-import pictures: `npm run db:import-library` (games can't start without them).
- Worktrees: copy env with `cp /Users/flwahl/Code/seen-game/.env.local .` and run `npm install`.
- Contracts for front end: `docs/API.md` (RPCs, errors, Realtime), `lib/game/types.ts`.
