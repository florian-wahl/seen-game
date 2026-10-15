-- Turn order: the host goes first, then the other players in the order they joined the lobby.
-- (Rematch: the caller first, then the previous game's seat order.) Replaces random seats.

create or replace function public.start_game_internal(game_id uuid, tiles jsonb)
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

  -- seats 1..n: the host (who pressed Start) first, then the others in the order they joined
  update public.game_players gp
     set seat = s.seat
    from (select p.user_id,
                 (row_number() over (order by (p.user_id = g.host_id) desc, p.joined_at, p.user_id))::int as seat
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

  insert into public.games (host_id, rounds_per_player, board_size, monochrome, layout, penalty_ms, cap_ms)
  values (v_uid, old.rounds_per_player, old.board_size, old.monochrome, old.layout, old.penalty_ms, old.cap_ms)
  returning id into v_new_id;

  -- Everyone is inserted in one statement, so a plain default would give them all the same
  -- joined_at. Stagger it by a microsecond so join order (which start_game_internal turns into
  -- seats) is: the caller (new host) first, then the previous game's seat order.
  insert into public.game_players (game_id, user_id, joined_at)
  select v_new_id, gp.user_id,
         now() + ((row_number() over (order by (gp.user_id = v_uid) desc, gp.seat nulls last,
                                               gp.joined_at, gp.user_id)) - 1) * interval '1 microsecond'
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
