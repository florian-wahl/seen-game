-- Draw reveal: after Draw the client shows the target for a fixed reveal window
-- with the board hidden. The server makes the END of that window the official
-- start (drawn_at), so scores stay pure search time (now - drawn_at + penalties).
-- deadline_at = drawn_at + cap_ms, so the sweeper / lazy close are unchanged.

create function private.reveal_ms()
returns int
language sql
immutable
set search_path = ''
as $$ select 1200 $$;

-- returns {turn_id, turn, target_picture_id, drawn_at (= draw time + reveal), deadline_at,
--          wrong_taps, server_now, already_drawn, tiles:[...]}
create or replace function public.draw_target(game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_game_id uuid := game_id;
  g public.games;
  t public.turns;
  v_target text;
  v_now timestamptz;
  v_already boolean := true;
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;

  select * into g from public.games x where x.id = v_game_id for update;
  if not found or not exists (select 1 from public.game_players gp
                               where gp.game_id = v_game_id and gp.user_id = v_uid) then
    perform private.err('not_a_member');
  end if;
  if g.status <> 'in_progress' then perform private.err('game_not_in_progress'); end if;

  if private.close_if_expired(v_game_id) then
    select * into g from public.games x where x.id = v_game_id;
    if g.status <> 'in_progress' then perform private.err('game_not_in_progress'); end if;
  end if;

  select * into t from public.turns x where x.id = g.current_turn_id for update;
  if not found or t.user_id <> v_uid then perform private.err('not_your_turn'); end if;

  if t.status = 'pending' then
    v_already := false;
    v_now := clock_timestamp();

    select bt.picture_id into v_target
      from public.board_tiles bt
     where bt.game_id = v_game_id
       and not exists (select 1 from public.turns u
                        where u.game_id = v_game_id and u.target_picture_id = bt.picture_id)
     order by random()
     limit 1;
    if v_target is null then perform private.err('invalid_argument'); end if;

    update public.turns x
       set status = 'live',
           drawn_at = v_now + (private.reveal_ms() * interval '1 millisecond'),
           deadline_at = v_now + ((private.reveal_ms() + g.cap_ms) * interval '1 millisecond'),
           target_picture_id = v_target
     where x.id = t.id
     returning * into t;

    update public.game_players gp
       set board_unlocked_at = coalesce(gp.board_unlocked_at, v_now)
     where gp.game_id = v_game_id and gp.user_id = v_uid;
  end if;

  return jsonb_build_object(
    'turn_id', t.id,
    'turn', private.turn_json(t),
    'target_picture_id', t.target_picture_id,
    'drawn_at', t.drawn_at,
    'deadline_at', t.deadline_at,
    'wrong_taps', t.wrong_taps,
    'server_now', clock_timestamp(),
    'already_drawn', v_already,
    'tiles', (select jsonb_agg(jsonb_build_object(
                'pictureId', bt.picture_id, 'x', bt.x, 'y', bt.y,
                'rotation', bt.rotation, 'scale', bt.scale) order by bt.picture_id)
                from public.board_tiles bt where bt.game_id = v_game_id));
end;
$$;

-- taps before drawn_at (during the reveal) are recorded uncounted
create or replace function public.submit_tap(turn_id uuid, picture_id text, client_seq int, client_elapsed_ms int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_turn_id uuid := turn_id;
  v_pic text := picture_id;
  v_seq int := client_seq;
  v_el int := client_elapsed_ms;
  v_game_id uuid;
  g public.games;
  t public.turns;
  v_now timestamptz;
  v_correct boolean;
  v_score int;
  v_deadline timestamptz;
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;
  if v_seq is null or v_pic is null then perform private.err('invalid_argument'); end if;

  select x.game_id into v_game_id from public.turns x where x.id = v_turn_id;
  if not found or not exists (select 1 from public.game_players gp
                               where gp.game_id = v_game_id and gp.user_id = v_uid) then
    perform private.err('turn_not_found');
  end if;

  select * into g from public.games x where x.id = v_game_id for update;
  select * into t from public.turns x where x.id = v_turn_id;
  if t.user_id <> v_uid then perform private.err('not_your_turn'); end if;

  -- retried request: return the earlier result, count nothing
  if exists (select 1 from public.taps k where k.turn_id = v_turn_id and k.client_seq = v_seq) then
    return private.tap_json(v_turn_id, v_seq, true);
  end if;

  if g.status <> 'in_progress' then perform private.err('game_not_in_progress'); end if;
  if not exists (select 1 from public.game_players gp
                  where gp.game_id = v_game_id and gp.user_id = v_uid and gp.status = 'active') then
    perform private.err('not_your_turn');
  end if;
  if t.status = 'pending' then perform private.err('turn_not_live'); end if;
  if not exists (select 1 from public.board_tiles bt
                  where bt.game_id = v_game_id and bt.picture_id = v_pic) then
    perform private.err('invalid_picture');
  end if;

  v_now := clock_timestamp();
  v_correct := (v_pic = t.target_picture_id);

  if t.status <> 'live' then
    -- turn already closed (e.g. capped by the sweeper): record, count nothing
    insert into public.taps (turn_id, client_seq, picture_id, server_at, correct, counted, client_elapsed_ms)
    values (v_turn_id, v_seq, v_pic, v_now, v_correct, false, v_el);

  elsif v_now < t.drawn_at then
    -- during the reveal (board hidden): record, count nothing, turn stays live
    insert into public.taps (turn_id, client_seq, picture_id, server_at, correct, counted, client_elapsed_ms)
    values (v_turn_id, v_seq, v_pic, v_now, v_correct, false, v_el);

  elsif v_now >= t.deadline_at then
    -- at/after the deadline: the tap does not count; turn caps at cap_ms
    insert into public.taps (turn_id, client_seq, picture_id, server_at, correct, counted, client_elapsed_ms)
    values (v_turn_id, v_seq, v_pic, v_now, v_correct, false, v_el);
    perform private.close_turn(v_turn_id, 'capped', g.cap_ms, t.deadline_at, true);

  elsif v_correct then
    v_score := least(
      round(extract(epoch from (v_now - t.drawn_at)) * 1000)::int + t.wrong_taps * g.penalty_ms,
      g.cap_ms);
    insert into public.taps (turn_id, client_seq, picture_id, server_at, correct, counted, client_elapsed_ms)
    values (v_turn_id, v_seq, v_pic, v_now, true, true, v_el);
    perform private.close_turn(v_turn_id, 'found', v_score, v_now, true);

  else
    v_deadline := t.deadline_at - (g.penalty_ms * interval '1 millisecond');
    update public.turns x
       set wrong_taps = x.wrong_taps + 1, deadline_at = v_deadline
     where x.id = v_turn_id;
    insert into public.taps (turn_id, client_seq, picture_id, server_at, correct, counted, client_elapsed_ms)
    values (v_turn_id, v_seq, v_pic, v_now, false, true, v_el);
    if v_deadline <= v_now then
      perform private.close_turn(v_turn_id, 'capped', g.cap_ms, v_deadline, true);
    end if;
  end if;

  return private.tap_json(v_turn_id, v_seq, false);
end;
$$;

revoke execute on function private.reveal_ms() from public, anon;
