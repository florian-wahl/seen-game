# Seen! v1 — Spec and Technical Design (source of truth for implementers)

This file merges the game specification (v0.3) and the technical design doc.
Both live as Claude Docs; this copy is what code is built against. If something
here is ambiguous, ask the lead engineer — do not invent rules.

---

## 1. Product summary

A phone-first web game where 2–6 friends take turns finding one picture among
~200 on a shared board. Lowest total time wins. Asynchronous: a game can stretch
over days. Inspired by Educa's Lynx. Working name "Seen!".

**v1 goals:** full game in a phone browser, no install; account + game + invite in
under a minute; time between turns never affects score; timing players trust.

**Out of scope v1:** live play, matchmaking, chat, payments, native apps,
per-game picture generation, Sign in with Apple, SMS sign-in.

## 2. Rules (as the code enforces them)

| Setting | Default | Options |
|---|---|---|
| Players | — | 2 to 6 |
| Rounds per player | 10 | 5, 10, 20 |
| Board size | 300 pictures | 200, 300, 500 |
| Monochrome | off | on: every picture (board, reveal, header target) in grayscale; highlights keep their color |
| Board layout | grid | grid (rows and columns, small offsets), or scattered (no rows or columns); either way fixed for the whole game |
| Turn order | random seats at start, then strict | — |

Constants copied onto each `games` row at creation: `penalty_ms = 5000`,
`cap_ms = 90000`, reminder after 24 h, forfeit after 72 h (both measured from
when the turn became current).

**A turn:** Ready screen (nothing timed) → player taps "Draw" → server picks a
random board picture not yet used as a target in this game → the target is shown
large over a hidden board for a fixed 1.2 s reveal (it flies into the header slot),
and the clock starts when the reveal ends (the server sets that instant as the official
start) → board appears → pan/zoom, tap a picture → correct tap stops the clock;
wrong tap adds 5 s and play continues → result shown, turn passes on.

**Round score:** `min(t_end − t_draw + w·penalty, cap)` where t are server
timestamps, w = wrong taps. Penalties count toward the cap (max round score 90 s).

**Deadline:** `deadline = t_draw + cap − w·penalty`. A tap at/after the deadline
does not count; the turn closes `capped` with score 90 000 ms. A wrong tap that
pulls the deadline to ≤ now caps immediately.

**Turn order:** next turn goes to the active player with the fewest completed
turns; ties → first seat after the current seat (cyclic). Round-robin when nobody
retires.

**End of game:** when no active player has turns left, OR when only one active
player remains (that player wins).

**Ranking:** active players by `total_ms` asc, then `wrong_taps` asc; equal on
both → shared rank. Retired players listed after the ranking as "retired", with
their completed rounds still shown.

**Stalled turns:** an undrawn (`pending`) turn gets a reminder 24 h after it
became current; at 72 h it closes `forfeited`, scored 90 000 ms with 0 wrong taps.
A drawn turn caps within 90 s so needs neither.

**Leaving:** a retiring player is removed from turn order; their open turn (pending
or live) closes `forfeited`. In the lobby, leaving just removes them; the host
leaving the lobby abandons the game.

**Invites:** link with a 22-char random token, expires 7 days. Opening prompts
sign-in then joins the lobby. No joining after start. Host starts with ≥ 2 players.
A lobby idle 7 days is abandoned.

**Rematch:** new lobby, same settings; caller is host; the previous game's other
(non-retired) players are added automatically; a new invite is returned for others.

## 3. Board and picture library

- Library: ~750 illustrations of everyday objects, one consistent style, one
  object per picture, transparent background, SVG. Each picture: id, name,
  category, review status (draft/approved/rejected). Confusable pairs are flagged
  and never share a board. Development uses placeholder images.
- Board generation (at game start, server side): sample N approved pictures with
  no confusable pair; grid layout with small random offsets/rotations, or a
  scattered layout with no rows or columns (game setting); categories spread so
  similar objects don't cluster; layout stored with the game; every player sees
  the identical board every round.
- Targets: each turn draws a different picture; never the same target twice in a game.

### Generator algorithm (`lib/board/generate.ts`, pure TS)

Input: approved pictures, confusable pairs, N, seed, layout (`grid` or `scatter`). Output: `Board` (see
`lib/board/types.ts`). One cell = 100 × 100 board units. PRNG: mulberry32 seeded
from a string (game id) via a string hash.

1. **Sample:** shuffle approved pictures, take greedily skipping any confusable
   with one already taken. If fewer than N, throw.
2. **Grid:** cols = ceil(√N), rows = ceil(N / cols) (N=200 → 15 cols × 14 rows).
   Empty cells spread evenly over the board, not all at the end.
3. **Category spread:** place randomly, then repair: for a cell with a
   same-category neighbour (8-neighbourhood), swap with a random cell when that
   lowers the conflict count. Stop at 2 000 passes or zero conflicts.
4. **Scatter:** scale 0.78–0.9, rotation ±20°, x/y offset up to ±8 units.
   Tile x,y = centre of the tile in board units.

**Scattered layout** (`layout = 'scatter'`): same sampling and the same board
area (cols × rows cells), so the density matches the grid. Steps 2–4 become:

2. **Points:** best-candidate sampling (12 candidates per point, keep the one
   farthest from those placed) over the board inset by 42 units; then relax:
   push apart any two centres closer than 84 units (the grid's worst case,
   100 − 2 × 8) until none are, clamped to the inset. The tap hit test (nearest
   centre within 50 units) is unchanged.
3. **Category spread:** same repair, with neighbours = tiles whose centres are
   within 140 units (about a grid diagonal).
4. **Scale and rotation** as for the grid; no extra offset.

Property tests: exactly N tiles; no confusable pair; no adjacent same-category
pair when repair reaches zero; identical output for the same seed. Scattered:
also no two centres closer than 84 units, all centres inside the inset, no line
of tiles that looks like a row or column.

## 4. Data model (Postgres, `public` schema)

Signed-in users may only SELECT, under RLS. All writes go through
`security definer` functions; insert/update/delete revoked from anon and
authenticated.

| Table | Key columns | Read access |
|---|---|---|
| `profiles` | `id` (= auth.users.id), `display_name`, `avatar_url` | any signed-in user |
| `pictures` | `id` text, `name`, `category`, `file_path`, `review_status` (draft/approved/rejected), `library_version` | any signed-in user |
| `picture_confusables` | `picture_a`, `picture_b`, check a < b | service role only |
| `games` | `id`, `host_id`, `status`, `rounds_per_player`, `board_size`, `monochrome`, `layout` (grid/scatter), `penalty_ms`, `cap_ms`, `current_turn_id`, `created_at`, `started_at`, `finished_at` | members |
| `game_players` | `game_id`, `user_id`, `seat`, `status` (active/retired), `turns_done`, `total_ms`, `wrong_taps`, `board_unlocked_at` | members |
| `invites` | `game_id`, `token`, `expires_at` | host |
| `board_tiles` | `game_id`, `picture_id`, `x`, `y`, `rotation`, `scale` | members whose `board_unlocked_at` is set |
| `turns` | `id`, `game_id`, `user_id`, `seq`, `round`, `status`, `became_current_at`, `drawn_at`, `deadline_at`, `ended_at`, `target_picture_id`, `wrong_taps`, `score_ms`, `reminded_at` | via view `turns_public` only |
| `taps` | `turn_id`, `client_seq`, `picture_id`, `server_at`, `correct`, `client_elapsed_ms` | the turn's own player |
| `push_subscriptions` | `user_id`, `endpoint`, `p256dh`, `auth` | owner |
| `notification_prefs` | `user_id`, `email`, `push`, `updated_at` (no row = both on) | owner |
| `notification_outbox` | `id`, `kind` (your_turn/reminder/game_finished), `user_id`, `game_id`, `payload`, `created_at`, `sent_at`, `attempts` | service role |

Integrity:
- `unique (game_id, seq)` on turns; partial unique index: one turn per game with
  status in (`pending`, `live`).
- `unique (turn_id, client_seq)` on taps (retries counted once).
- `unique (game_id, target_picture_id)` on turns.
- Every state-changing function starts with `select … from games where id = $1 for update`.
- `turns_public` view exposes `target_picture_id` only when `drawn_at is not null`;
  base `turns` has no client policy.

**Game states:** `lobby` → `in_progress` (host starts, 2–6 players);
`lobby` → `abandoned` (host cancels/leaves, or idle 7 days);
`in_progress` → `finished` (last turn ends, or one active player remains).

**Turn states:** `pending` → `live` (draw_target only); `live` → `found` (correct
tap before deadline) | `capped` (deadline passes) | `forfeited` (player retires);
`pending` → `forfeited` (72 h unplayed, or player retires). Every close runs
`advance()` in the same transaction: adds score to `game_players` totals, applies
end-of-game rules, otherwise inserts the next `pending` turn and queues a
`your_turn` outbox row.

## 5. Server functions (plpgsql, `security definer`, `set search_path = ''`)

| Function | Caller | Behaviour |
|---|---|---|
| `create_game(rounds int, board_size int, monochrome boolean default false, layout text default 'grid')` | host | inserts game (`lobby`), host as player, invite; returns game id + token |
| `join_game(token text)` | invitee | checks lobby, expiry, 6-player limit; inserts game_players; idempotent |
| `start_game_internal(game_id uuid, tiles jsonb)` | service role only (Next.js server action) | action checks host & ≥2 players; this assigns random seats, inserts tiles, creates turn seq 1, sets `in_progress` |
| `draw_target(game_id uuid)` | current player | pending → picks random unused tile picture, `drawn_at = now() + 1.2 s reveal` (the official start), `deadline_at = drawn_at + cap`, `live`, sets `board_unlocked_at` on first draw. Already live → returns same turn. Returns target, tiles, `deadline_at`, `server_now` |
| `submit_tap(turn_id uuid, picture_id text, client_seq int, client_elapsed_ms int)` | current player | repeated client_seq → returns earlier result. Before `drawn_at` (during the reveal) → recorded uncounted, no penalty, turn stays live. Past deadline → `capped`. Correct → `found` with score. Wrong → wrong_taps+1, deadline earlier, cap if passed. Returns turn state |
| `retire(game_id uuid)` | member | see Leaving rule |
| `rematch(game_id uuid)` | member of finished game | see Rematch rule |
| `advance(game_id uuid)` | internal | see turn states |
| `sweep_turns()` | pg_cron every minute | caps expired live turns, queues reminders at 24 h, forfeits at 72 h |
| `game_state(game_id uuid)` | member | one JSON read for the game page (also lazily closes expired live turn) |

**Lazy close:** `draw_target`, `submit_tap` and `game_state` close an expired
`live` turn before answering.

**Draw reveal:** the board is hidden for a fixed 1.2 s after Draw (`private.reveal_ms()`).
`drawn_at` = draw time + 1.2 s, so scores stay pure search time and the sweeper (which
uses `deadline_at = drawn_at + cap`) is unchanged. Taps before `drawn_at` are uncounted.

**Client timing:** `offset = server_now − Date.now()` at receipt. Display clock =
`now + offset − drawn_at + wrong_taps × 5 s`, redrawn every frame, 0.1 s
precision. Display only; score is what the server returns. `client_elapsed_ms`
is logged, never scored.

## 6. Front end

Next.js 16 App Router (READ `node_modules/next/dist/docs/` before writing Next
code — it has breaking changes vs older versions), Tailwind 4, `@supabase/ssr`.

| Route | Screen | Data |
|---|---|---|
| `/signin` | Sign in | magic link, Google |
| `/` | Home: my games, whose turn, New game button | |
| `/new` | New game: Game settings (rounds, board size, Monochrome, Scattered board), share link (`navigator.share`, copy fallback) | `create_game` |
| `/join/[token]` | Invite landing → sign-in if needed → `join_game` → lobby | |
| `/g/[id]` | Lobby / game scoreboard / final results by status | `game_state` + Realtime `game:{id}` |
| `/g/[id]/play` | Ready, Round, Round result | `draw_target`, `submit_tap` |
| `/g/[id]/board` | Board study (read-only, after own first draw) | tiles |
| `/dev/board` | Dev-only board prototype (M2) | local generator |

**Board renderer (`components/board/`):** one Canvas 2D, camera `{x, y, zoom}`;
each frame clears and `drawImage`s visible tiles only; `devicePixelRatio`
aware. SVG → `ImageBitmap` at 128 px; re-rasterize at 256 px when a tile exceeds
128 device px; cache by picture id. Zoom: default = half the board width (~quarter
of the board); during a round, zoom out stops at the default (seeing more makes it too easy);
the board study screen can zoom out to the full board width; max = tile ≈ 160 px. Wrong tap: red
flash + floating "+5 s" (600 ms). Correct: green ring.

**Gestures (`useBoardGestures`):** Pointer Events, `touch-action: none`. One
pointer pans with inertia; two pointers pinch-zoom around the midpoint.
Tap = single pointer, total movement < 8 CSS px, down < 350 ms. Hit test:
inverse camera transform, nearest tile centre within 50 board units; empty space
does nothing. Taps carry increasing `client_seq`; next tap waits for the previous
reply.

**Round screen:** target pinned at top with running clock; board fills the rest.
Portrait is the design target. Pictures ≥ 44 px at default zoom.

**Loading:** Ready screen downloads the whole library bundle
`library-v{n}.json` (all approved SVGs) and rasterizes before enabling Draw.
Service worker (Serwist) caches it forever.

## 7. Back end

- Supabase Auth: email magic link + Google OAuth. Trigger on `auth.users`
  creates `profiles`. Display name set on first sign-in; `/profile` (from the Home
  account menu) changes it and the per-channel notification preferences.
- Storage: public read-only `pictures` bucket; private `avatars` bucket.
- Outbox: SQL inserts `notification_outbox` rows; `after insert` trigger uses
  `pg_net` to POST `/api/jobs/notify` with a shared secret; route sends via
  Resend (email) and `web-push` (VAPID), skipping any channel the player turned off
  in `notification_prefs` (still marked sent), marks sent; deletes push subscriptions on
  404/410. pg_cron runs `sweep_turns()` every minute and retries outbox rows
  unsent > 5 min. `your_turn` and `game_finished` go by push only, never email (to keep
  email volume down); only the 24 h reminder goes by both.

## 8. Milestones

| # | Milestone | Done when |
|---|---|---|
| 1 | Board generator + placeholder library | script outputs a 200-picture board with no confusable pair |
| 2 | Board prototype (canvas, pan/zoom/tap, no back end) | 200 pictures pan smoothly on a mid-range phone; a drag never counts as a tap |
| 3 | Solo timed round | reload mid-round returns same target with clock running; wrong tap +5 s; round ends at 90 s |
| 4 | Accounts and invites | two people on two phones join the same lobby from one link |
| 5 | Full game loop | 2-player 5-round game completes; no drawing out of turn; board hidden before first round, viewable after |
| 6 | Notifications and stalled turns | "Your turn" push; reminder email + push at 24 h; forfeit after 72 h |
| 7 | Final library + friends beta | real game with 3+ friends finishes with no manual fixes |
