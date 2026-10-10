-- Exposed game RPCs. All: security definer, search_path '', return jsonb,
-- callable by `authenticated` only (start_game_internal: service_role only).
-- Parameter names are part of the API contract (PostgREST named args).
-- Inside bodies, columns are always alias-qualified and parameters are copied
-- to v_* variables first, so parameter/column names never clash.

-- Result of a tap (fresh or replayed), read back from the stored rows.
create function private.tap_json(p_turn_id uuid, p_client_seq int, p_replayed boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'turn', private.turn_json(t),
    'client_seq', k.client_seq,
    'picture_id', k.picture_id,
    'correct', k.correct,
    'counted', k.counted,
    'replayed', p_replayed,
    'game_status', g.status,
    'current_turn_id', g.current_turn_id,
    'server_now', clock_timestamp()
  )
  from public.turns t
  join public.taps k on k.turn_id = t.id and k.client_seq = p_client_seq
  join public.games g on g.id = t.game_id
  where t.id = p_turn_id;
$$;

-- ------------------------------------------------------------ create_game
-- returns {game_id, token, expires_at}
create function public.create_game(rounds int, board_size int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rounds int := rounds;
  v_size int := board_size;
  v_game_id uuid;
  v_token text;
  v_exp timestamptz := clock_timestamp() + interval '7 days';
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;
  if v_rounds is null or v_rounds not in (3, 5, 10) then perform private.err('invalid_argument'); end if;
  if v_size is null or v_size not in (100, 200, 300) then perform private.err('invalid_argument'); end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    perform private.err('not_authenticated');
  end if;

  insert into public.games (host_id, rounds_per_player, board_size)
  values (v_uid, v_rounds, v_size)
  returning id into v_game_id;

  insert into public.game_players (game_id, user_id) values (v_game_id, v_uid);

  v_token := private.new_token();
  insert into public.invites (token, game_id, expires_at) values (v_token, v_game_id, v_exp);

  return jsonb_build_object('game_id', v_game_id, 'token', v_token, 'expires_at', v_exp);
end;
$$;

-- -------------------------------------------------------------- join_game
-- returns {game_id, status, already_member}
create function public.join_game(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := token;
  inv public.invites;
  g public.games;
  v_count int;
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;

  select * into inv from public.invites i where i.token = v_token;
  if not found then perform private.err('invite_not_found'); end if;

  select * into g from public.games x where x.id = inv.game_id for update;

  if exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.user_id = v_uid) then
    return jsonb_build_object('game_id', g.id, 'status', g.status, 'already_member', true);
  end if;

  if g.status <> 'lobby' then perform private.err('game_not_in_lobby'); end if;
  if inv.expires_at <= clock_timestamp() then perform private.err('invite_expired'); end if;

  select count(*) into v_count from public.game_players gp where gp.game_id = g.id;
  if v_count >= 6 then perform private.err('lobby_full'); end if;

  insert into public.game_players (game_id, user_id) values (g.id, v_uid);
  update public.games x set last_activity_at = clock_timestamp() where x.id = g.id;

  return jsonb_build_object('game_id', g.id, 'status', g.status, 'already_member', false);
end;
$$;

-- ------------------------------------------------------ start_game_internal
-- service_role only. tiles = [{pictureId,x,y,rotation,scale}, ...]
-- returns {game_id, status, first_turn_id, first_user_id, seats:[{user_id,seat}]}
create function public.start_game_internal(game_id uuid, tiles jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid := game_id;
  v_tiles jsonb := tiles;
  g public.games;
  v_players int;
  v_turn public.turns;
begin
  select * into g from public.games x where x.id = v_game_id for update;
  if not found then perform private.err('game_not_found'); end if;
  if g.status <> 'lobby' then perform private.err('game_not_in_lobby'); end if;

  select count(*) into v_players from public.game_players gp where gp.game_id = v_game_id;
  if v_players < 2 or v_players > 6 then perform private.err('not_enough_players'); end if;

  if v_tiles is null or jsonb_typeof(v_tiles) <> 'array'
     or jsonb_array_length(v_tiles) <> g.board_size then
    perform private.err('invalid_argument');
  end if;
  if (select count(distinct e ->> 'pictureId') from jsonb_array_elements(v_tiles) e) <> g.board_size then
    perform private.err('invalid_argument');
  end if;

  -- random seats 1..n
  update public.game_players gp
     set seat = s.seat
    from (select p.user_id, (row_number() over (order by random()))::int as seat
            from public.game_players p where p.game_id = v_game_id) s
   where gp.game_id = v_game_id and gp.user_id = s.user_id;

  begin
    insert into public.board_tiles (game_id, picture_id, x, y, rotation, scale)
    select v_game_id, r."pictureId", r.x, r.y, r.rotation, r.scale
      from jsonb_to_recordset(v_tiles)
           as r ("pictureId" text, x double precision, y double precision,
                 rotation double precision, scale double precision);
  exception when not_null_violation or foreign_key_violation then
    perform private.err('invalid_argument');
  end;

  update public.games x
     set status = 'in_progress', started_at = now(), last_activity_at = clock_timestamp()
   where x.id = v_game_id;

  perform private.advance(v_game_id);  -- creates turn seq 1 + your_turn outbox row

  select * into v_turn from public.turns t where t.game_id = v_game_id and t.seq = 1;

  return jsonb_build_object(
    'game_id', v_game_id,
    'status', 'in_progress',
    'first_turn_id', v_turn.id,
    'first_user_id', v_turn.user_id,
    'seats', (select jsonb_agg(jsonb_build_object('user_id', gp.user_id, 'seat', gp.seat) order by gp.seat)
                from public.game_players gp where gp.game_id = v_game_id));
end;
$$;

-- ------------------------------------------------------------ draw_target
-- returns {turn_id, turn, target_picture_id, drawn_at, deadline_at, wrong_taps,
--          server_now, already_drawn, tiles:[{pictureId,x,y,rotation,scale}]}
create function public.draw_target(game_id uuid)
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
       set status = 'live', drawn_at = v_now,
           deadline_at = v_now + (g.cap_ms * interval '1 millisecond'),
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

-- -------------------------------------------------------------- submit_tap
-- returns {turn, client_seq, picture_id, correct, counted, replayed,
--          game_status, current_turn_id, server_now}
create function public.submit_tap(turn_id uuid, picture_id text, client_seq int, client_elapsed_ms int)
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

-- ------------------------------------------------------------------ retire
-- returns {game_id, status, left:boolean}  (status = game status afterwards)
create function public.retire(game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_game_id uuid := game_id;
  g public.games;
  me public.game_players;
  t public.turns;
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;

  select * into g from public.games x where x.id = v_game_id for update;
  if found then
    select * into me from public.game_players gp where gp.game_id = v_game_id and gp.user_id = v_uid;
  end if;
  if g.id is null or me.user_id is null then perform private.err('not_a_member'); end if;

  if g.status = 'lobby' then
    if g.host_id = v_uid then
      update public.games x set status = 'abandoned', last_activity_at = clock_timestamp() where x.id = v_game_id;
      return jsonb_build_object('game_id', v_game_id, 'status', 'abandoned', 'left', true);
    end if;
    delete from public.game_players gp where gp.game_id = v_game_id and gp.user_id = v_uid;
    update public.games x set last_activity_at = clock_timestamp() where x.id = v_game_id;
    return jsonb_build_object('game_id', v_game_id, 'status', 'lobby', 'left', true);
  end if;

  if g.status <> 'in_progress' then perform private.err('game_not_in_progress'); end if;

  if me.status = 'retired' then   -- idempotent
    return jsonb_build_object('game_id', v_game_id, 'status', g.status, 'left', true);
  end if;

  update public.game_players gp set status = 'retired'
   where gp.game_id = v_game_id and gp.user_id = v_uid;

  select * into t from public.turns x
   where x.game_id = v_game_id and x.user_id = v_uid and x.status in ('pending', 'live')
   for update;
  if found then
    -- open turn forfeits without touching the retiring player's totals
    perform private.close_turn(t.id, 'forfeited', null, clock_timestamp(), false);
  else
    perform private.advance(v_game_id);  -- finishes the game if one active player remains
  end if;

  select x.status into g.status from public.games x where x.id = v_game_id;
  return jsonb_build_object('game_id', v_game_id, 'status', g.status, 'left', true);
end;
$$;

-- ----------------------------------------------------------------- rematch
-- returns {game_id, token, expires_at, previous_game_id, players:[user_id...]}
create function public.rematch(game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old_id uuid := game_id;
  old public.games;
  v_new_id uuid;
  v_token text;
  v_exp timestamptz := clock_timestamp() + interval '7 days';
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;

  select * into old from public.games x where x.id = v_old_id for update;
  if not found or not exists (select 1 from public.game_players gp
                               where gp.game_id = v_old_id and gp.user_id = v_uid) then
    perform private.err('not_a_member');
  end if;
  if old.status <> 'finished' then perform private.err('game_not_finished'); end if;

  insert into public.games (host_id, rounds_per_player, board_size, penalty_ms, cap_ms)
  values (v_uid, old.rounds_per_player, old.board_size, old.penalty_ms, old.cap_ms)
  returning id into v_new_id;

  insert into public.game_players (game_id, user_id)
  select v_new_id, gp.user_id
    from public.game_players gp
   where gp.game_id = v_old_id and (gp.user_id = v_uid or gp.status = 'active');

  v_token := private.new_token();
  insert into public.invites (token, game_id, expires_at) values (v_token, v_new_id, v_exp);

  return jsonb_build_object(
    'game_id', v_new_id, 'token', v_token, 'expires_at', v_exp, 'previous_game_id', v_old_id,
    'players', (select jsonb_agg(gp.user_id order by gp.joined_at, gp.user_id)
                  from public.game_players gp where gp.game_id = v_new_id));
end;
$$;

-- -------------------------------------------------------------- game_state
-- returns {
--   server_now,
--   game:{id,host_id,status,rounds_per_player,board_size,penalty_ms,cap_ms,current_turn_id,
--         created_at,started_at,finished_at},
--   players:[{user_id,display_name,avatar_url,seat,status,turns_done,total_ms,wrong_taps,
--             rank (null when retired or game not started),is_host,board_unlocked}]  -- ranked first, retired last
--   turns:[turns_public columns, ordered by seq],
--   current_turn: turns_public row | null,
--   whose_turn: user_id | null,
--   is_my_turn: bool,
--   me:{user_id,status,seat,rank,board_unlocked},
--   board_unlocked: bool,
--   invite:{token,expires_at} | null   (host, lobby only)
-- }
create function public.game_state(game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_game_id uuid := game_id;
  g public.games;
  v_turns jsonb;
  v_cur jsonb;
  v_players jsonb;
  v_me jsonb;
  v_invite jsonb;
  v_started boolean;
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;

  select * into g from public.games x where x.id = v_game_id for update;
  if not found or not exists (select 1 from public.game_players gp
                               where gp.game_id = v_game_id and gp.user_id = v_uid) then
    perform private.err('not_a_member');
  end if;

  if g.status = 'in_progress' then
    if private.close_if_expired(v_game_id) then
      select * into g from public.games x where x.id = v_game_id;
    end if;
  end if;

  v_started := g.status in ('in_progress', 'finished');

  select coalesce(jsonb_agg(to_jsonb(tp) order by tp.seq), '[]'::jsonb) into v_turns
    from public.turns_public tp where tp.game_id = v_game_id;

  select to_jsonb(tp) into v_cur from public.turns_public tp where tp.id = g.current_turn_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', gp.user_id,
           'display_name', p.display_name,
           'avatar_url', p.avatar_url,
           'seat', gp.seat,
           'status', gp.status,
           'turns_done', gp.turns_done,
           'total_ms', gp.total_ms,
           'wrong_taps', gp.wrong_taps,
           'rank', case when v_started then rk.rank end,
           'is_host', gp.user_id = g.host_id,
           'board_unlocked', gp.board_unlocked_at is not null
         ) order by (gp.status = 'retired'), rk.rank nulls last,
                    gp.total_ms, gp.wrong_taps, gp.seat nulls last, gp.joined_at), '[]'::jsonb)
    into v_players
    from public.game_players gp
    join public.profiles p on p.id = gp.user_id
    left join private.ranking(v_game_id) rk on rk.user_id = gp.user_id
   where gp.game_id = v_game_id;

  select jsonb_build_object(
           'user_id', gp.user_id, 'status', gp.status, 'seat', gp.seat,
           'rank', case when v_started then rk.rank end,
           'board_unlocked', gp.board_unlocked_at is not null)
    into v_me
    from public.game_players gp
    left join private.ranking(v_game_id) rk on rk.user_id = gp.user_id
   where gp.game_id = v_game_id and gp.user_id = v_uid;

  if g.status = 'lobby' and g.host_id = v_uid then
    select jsonb_build_object('token', i.token, 'expires_at', i.expires_at) into v_invite
      from public.invites i where i.game_id = v_game_id;
  end if;

  return jsonb_build_object(
    'server_now', clock_timestamp(),
    'game', jsonb_build_object(
      'id', g.id, 'host_id', g.host_id, 'status', g.status,
      'rounds_per_player', g.rounds_per_player, 'board_size', g.board_size,
      'penalty_ms', g.penalty_ms, 'cap_ms', g.cap_ms, 'current_turn_id', g.current_turn_id,
      'created_at', g.created_at, 'started_at', g.started_at, 'finished_at', g.finished_at),
    'players', v_players,
    'turns', v_turns,
    'current_turn', v_cur,
    'whose_turn', v_cur ->> 'user_id',
    'is_my_turn', coalesce(v_cur ->> 'user_id' = v_uid::text, false),
    'me', v_me,
    'board_unlocked', coalesce((v_me ->> 'board_unlocked')::boolean, false),
    'invite', v_invite);
end;
$$;

-- --------------------------------------------------------- update_profile
-- (addition to the spec: profiles are otherwise read-only for clients)
-- returns {id, display_name, avatar_url}
create function public.update_profile(display_name text default null, avatar_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(btrim(display_name), '');
  v_avatar text := avatar_url;
  p public.profiles;
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;
  if v_name is not null and char_length(v_name) > 60 then perform private.err('invalid_argument'); end if;
  update public.profiles x
     set display_name = coalesce(v_name, x.display_name),
         avatar_url = coalesce(v_avatar, x.avatar_url)
   where x.id = v_uid
   returning * into p;
  if not found then perform private.err('not_authenticated'); end if;
  return jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url);
end;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on function
  public.create_game(int, int), public.join_game(text), public.start_game_internal(uuid, jsonb),
  public.draw_target(uuid), public.submit_tap(uuid, text, int, int), public.retire(uuid),
  public.rematch(uuid), public.game_state(uuid), public.update_profile(text, text)
  from public, anon, authenticated;

grant execute on function
  public.create_game(int, int), public.join_game(text),
  public.draw_target(uuid), public.submit_tap(uuid, text, int, int), public.retire(uuid),
  public.rematch(uuid), public.game_state(uuid), public.update_profile(text, text)
  to authenticated;

grant execute on function public.start_game_internal(uuid, jsonb) to service_role;
