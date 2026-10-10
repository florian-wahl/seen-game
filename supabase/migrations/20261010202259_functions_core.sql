-- Private (non-exposed) game engine helpers.
--
-- Time source: tap/draw/turn-change times use clock_timestamp() (wall clock,
-- advances inside a transaction) rather than now()/transaction_timestamp().
-- This keeps timing honest if a statement runs long and lets multi-statement
-- test transactions observe time moving. The only now() uses are the cosmetic
-- created_at/started_at columns.
--
-- All helpers here assume the caller already holds `games ... for update`.

-- Raise a coded error. SQLSTATE is distinct per code; the message is the code.
create function private.err(p_code text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_state text;
begin
  v_state := case p_code
    when 'not_authenticated'  then 'SN001'
    when 'not_a_member'       then 'SN002'
    when 'game_not_found'     then 'SN003'
    when 'not_your_turn'      then 'SN004'
    when 'game_not_in_progress' then 'SN005'
    when 'game_not_in_lobby'  then 'SN006'
    when 'lobby_full'         then 'SN007'
    when 'invite_expired'     then 'SN008'
    when 'invite_not_found'   then 'SN009'
    when 'invalid_argument'   then 'SN010'
    when 'turn_not_found'     then 'SN011'
    when 'turn_not_live'      then 'SN012'
    when 'game_not_finished'  then 'SN013'
    when 'invalid_picture'    then 'SN014'
    when 'not_enough_players' then 'SN015'
    else 'SN999'
  end;
  raise exception '%', p_code using errcode = v_state;
end;
$$;

create function private.new_token()
returns text
language sql
volatile
set search_path = ''
as $$
  -- 16 random bytes -> 22 url-safe base64 chars (padding stripped)
  select translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_');
$$;

create function private.queue_notification(
  p_kind public.outbox_kind, p_user_id uuid, p_game_id uuid, p_payload jsonb default '{}'::jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.notification_outbox (kind, user_id, game_id, payload)
  values (p_kind, p_user_id, p_game_id, p_payload);
$$;

-- Standing of active players: competition ranking (1,1,3), by total_ms then wrong_taps.
create function private.ranking(p_game_id uuid)
returns table (user_id uuid, rank int)
language sql
stable
set search_path = ''
as $$
  select gp.user_id,
         (rank() over (order by gp.total_ms asc, gp.wrong_taps asc))::int
  from public.game_players gp
  where gp.game_id = p_game_id and gp.status = 'active';
$$;

-- JSON for a turn row. target_picture_id only once drawn.
create function private.turn_json(t public.turns)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'game_id', t.game_id,
    'user_id', t.user_id,
    'seq', t.seq,
    'round', t.round,
    'status', t.status,
    'became_current_at', t.became_current_at,
    'drawn_at', t.drawn_at,
    'deadline_at', t.deadline_at,
    'ended_at', t.ended_at,
    'target_picture_id', case when t.drawn_at is not null then t.target_picture_id end,
    'wrong_taps', t.wrong_taps,
    'score_ms', t.score_ms,
    'reminded_at', t.reminded_at
  );
$$;

-- End the game: close any dangling open turn (unscored), mark finished, notify everyone.
create function private.finish_game(p_game_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  update public.turns t
     set status = 'forfeited', ended_at = clock_timestamp(), score_ms = null
   where t.game_id = p_game_id and t.status in ('pending', 'live');

  update public.games g
     set status = 'finished', finished_at = clock_timestamp(), current_turn_id = null
   where g.id = p_game_id;

  for r in
    select gp.user_id, gp.status, gp.total_ms, gp.wrong_taps, rk.rank
    from public.game_players gp
    left join private.ranking(p_game_id) rk on rk.user_id = gp.user_id
    where gp.game_id = p_game_id
  loop
    perform private.queue_notification('game_finished', r.user_id, p_game_id,
      jsonb_build_object('rank', r.rank, 'retired', r.status = 'retired',
                         'total_ms', r.total_ms, 'wrong_taps', r.wrong_taps));
  end loop;
end;
$$;

-- Ensure the game has its next pending turn, or finish it. Idempotent: does
-- nothing when an open turn already exists (and the game is still contested).
create function private.advance(p_game_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  g public.games;
  v_active int;
  v_cur_seat int;
  v_seats int;
  v_next record;
  v_turn_id uuid;
begin
  select * into g from public.games x where x.id = p_game_id;
  if not found or g.status <> 'in_progress' then
    return;
  end if;

  select count(*) into v_active
    from public.game_players gp where gp.game_id = p_game_id and gp.status = 'active';
  if v_active <= 1 then
    perform private.finish_game(p_game_id);
    return;
  end if;

  if exists (select 1 from public.turns t
              where t.game_id = p_game_id and t.status in ('pending', 'live')) then
    return;
  end if;

  select coalesce(gp.seat, 0) into v_cur_seat
    from public.turns t
    join public.game_players gp on gp.game_id = t.game_id and gp.user_id = t.user_id
   where t.game_id = p_game_id
   order by t.seq desc limit 1;
  v_cur_seat := coalesce(v_cur_seat, 0);

  select count(*) into v_seats
    from public.game_players gp where gp.game_id = p_game_id and gp.seat is not null;

  select gp.user_id, gp.turns_done into v_next
    from public.game_players gp
   where gp.game_id = p_game_id
     and gp.status = 'active'
     and gp.turns_done < g.rounds_per_player
   order by gp.turns_done asc,
            ((gp.seat - v_cur_seat + v_seats - 1) % v_seats) asc,
            gp.seat asc
   limit 1;

  if not found then
    perform private.finish_game(p_game_id);
    return;
  end if;

  insert into public.turns (game_id, user_id, seq, round, status, became_current_at)
  values (
    p_game_id, v_next.user_id,
    coalesce((select max(t.seq) from public.turns t where t.game_id = p_game_id), 0) + 1,
    v_next.turns_done + 1, 'pending', clock_timestamp())
  returning id into v_turn_id;

  update public.games x set current_turn_id = v_turn_id where x.id = p_game_id;

  perform private.queue_notification('your_turn', v_next.user_id, p_game_id,
    jsonb_build_object('turn_id', v_turn_id, 'round', v_next.turns_done + 1));
end;
$$;

-- Close an open turn and move the game on. p_count = false for retirements
-- (nothing is added to the retiring player's totals).
create function private.close_turn(
  p_turn_id uuid, p_status public.turn_status, p_score int, p_ended_at timestamptz, p_count boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t public.turns;
begin
  update public.turns x
     set status = p_status, ended_at = p_ended_at, score_ms = p_score
   where x.id = p_turn_id
   returning * into t;

  if p_count then
    update public.game_players gp
       set turns_done = gp.turns_done + 1,
           total_ms = gp.total_ms + p_score,
           wrong_taps = gp.wrong_taps + t.wrong_taps
     where gp.game_id = t.game_id and gp.user_id = t.user_id;
  end if;

  perform private.advance(t.game_id);
end;
$$;

-- Lazily cap a live turn whose deadline has passed. Returns true if one was closed.
create function private.close_if_expired(p_game_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  t public.turns;
  v_cap int;
begin
  select * into t from public.turns x
   where x.game_id = p_game_id and x.status = 'live' and x.deadline_at <= clock_timestamp()
   for update;
  if not found then
    return false;
  end if;
  select g.cap_ms into v_cap from public.games g where g.id = p_game_id;
  perform private.close_turn(t.id, 'capped', v_cap, t.deadline_at, true);
  return true;
end;
$$;

revoke execute on all functions in schema private from public, anon;
-- helper predicates used by RLS were granted in the previous migration
grant execute on function private.is_member(uuid), private.is_host(uuid),
  private.board_unlocked(uuid), private.owns_turn(uuid) to authenticated, service_role;
