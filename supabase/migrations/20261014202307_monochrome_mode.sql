-- Monochrome mode (issue #1): a game setting chosen by the host at creation. When on, every
-- picture in the game (board, target, reveal) is shown in grayscale. Rematches copy it.

alter table public.games add column monochrome boolean not null default false;

-- create_game gains an optional third argument (default off). Dropped and recreated rather than
-- overloaded, so a two-argument call stays unambiguous.
drop function public.create_game(int, int);

create function public.create_game(rounds int, board_size int, monochrome boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rounds int := rounds;
  v_size int := board_size;
  v_mono boolean := coalesce(monochrome, false);
  v_game_id uuid;
  v_token text;
  v_exp timestamptz := clock_timestamp() + interval '7 days';
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;
  if v_rounds is null or v_rounds not in (5, 10, 20) then perform private.err('invalid_argument'); end if;
  if v_size is null or v_size not in (200, 300, 500) then perform private.err('invalid_argument'); end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    perform private.err('not_authenticated');
  end if;

  insert into public.games (host_id, rounds_per_player, board_size, monochrome)
  values (v_uid, v_rounds, v_size, v_mono)
  returning id into v_game_id;

  insert into public.game_players (game_id, user_id) values (v_game_id, v_uid);

  v_token := private.new_token();
  insert into public.invites (token, game_id, expires_at) values (v_token, v_game_id, v_exp);

  return jsonb_build_object('game_id', v_game_id, 'token', v_token, 'expires_at', v_exp);
end;
$$;

revoke execute on function public.create_game(int, int, boolean) from public, anon, authenticated;
grant execute on function public.create_game(int, int, boolean) to authenticated;

create or replace function public.rematch(game_id uuid)
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

  insert into public.games (host_id, rounds_per_player, board_size, monochrome, penalty_ms, cap_ms)
  values (v_uid, old.rounds_per_player, old.board_size, old.monochrome, old.penalty_ms, old.cap_ms)
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

-- game_state: game.monochrome added (otherwise unchanged).
create or replace function public.game_state(game_id uuid)
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
      'rounds_per_player', g.rounds_per_player, 'board_size', g.board_size, 'monochrome', g.monochrome,
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
