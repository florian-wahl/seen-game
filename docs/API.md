# Seen! — Database API contract (front end codes against this)

All RPCs are called with `supabase.rpc(name, args)`; args are named exactly as below.
All return `jsonb`. Timestamps are ISO strings, `*_ms` ints, ids uuids (picture ids are text slugs).
Errors: `error.code` is the SQLSTATE, `error.message` the code string.

| SQLSTATE | message | When |
|---|---|---|
| SN001 | not_authenticated | |
| SN002 | not_a_member | |
| SN003 | game_not_found | |
| SN004 | not_your_turn | |
| SN005 | game_not_in_progress | |
| SN006 | game_not_in_lobby | join after start / abandoned, start twice |
| SN007 | lobby_full | 6 players |
| SN008 | invite_expired | |
| SN009 | invite_not_found | |
| SN010 | invalid_argument | bad rounds/board size/tiles |
| SN011 | turn_not_found | |
| SN012 | turn_not_live | tap before draw |
| SN013 | game_not_finished | rematch |
| SN014 | invalid_picture | tapped picture not on this board |
| SN015 | not_enough_players | |
| 42501 | permission denied | service-role-only function called by a user |

## RPCs

- `create_game({rounds, board_size})` → `{game_id, token, expires_at}` — rounds ∈ {3,5,10}, board_size ∈ {100,200,300}.
- `join_game({token})` → `{game_id, status, already_member}` — idempotent for members (even after start/expiry).
- `start_game_internal({game_id, tiles})` — **service role only** (Next.js server action). tiles = `Tile[]`
  from `lib/board/types.ts`. → `{game_id, status:'in_progress', first_turn_id, first_user_id, seats:[{user_id, seat}]}`.
  Requires `pictures` rows for every tile.
- `draw_target({game_id})` → `{turn_id, turn, target_picture_id, drawn_at, deadline_at, wrong_taps, server_now,
  already_drawn, tiles: Tile[]}` — second call returns the same target/deadline with `already_drawn: true`
  (use this to resume after reload).
- `submit_tap({turn_id, picture_id, client_seq, client_elapsed_ms})` → `{turn, client_seq, picture_id, correct,
  counted, replayed, game_status, current_turn_id, server_now}`.
  `turn` = `{id, game_id, user_id, seq, round, status, became_current_at, drawn_at, deadline_at, ended_at,
  target_picture_id, wrong_taps, score_ms, reminded_at}`. `turn.status`: `live` after a wrong tap (deadline
  moved 5 s earlier), `found` after a correct tap, `capped` (score 90000) when late or a penalty exhausted the time.
  `counted:false` = tap arrived at/after the deadline or on a closed turn. `replayed:true` = same client_seq resent.
- `retire({game_id})` → `{game_id, status, left:true}` (status = game status afterwards; host leaving lobby → `abandoned`).
- `rematch({game_id})` → `{game_id, token, expires_at, previous_game_id, players:[uuid]}`.
- `update_profile({display_name?, avatar_url?})` → `{id, display_name, avatar_url}` (only way to edit a profile).
- `game_state({game_id})` → see `GameState` in `lib/game/types.ts`. Lazily closes an expired live turn.
- `sweep_turns()` — service role / cron only.

## Tables readable directly (RLS)
`profiles`, `pictures` (any signed-in user); `games`, `game_players`, `turns_public` (members);
`board_tiles` (members after their own first draw); `taps` (own turns); `invites` (host).

## Realtime contract
Private Broadcast channel per game: topic `game:<game_id>`, event `changed`, payload `{game_id, table}`.
Sent by DB triggers on `games`, `game_players`, `turns` changes. Only members may subscribe.
Payloads carry no game data (Supabase adds a random message `id`): clients re-fetch `game_state` when they receive one.
`useGameState(gameId)` in `lib/game/useGameState.ts` wraps this (plus a 20 s polling fallback).

## Pictures
Picture files are served by the Next app from `LIBRARY_ROOT` (`lib/library/index.ts`); `loadImageMap()` gives
pictureId → URL. DB `pictures` rows are imported from the manifest by `scripts/import-library.ts`.
