-- Game setting options (issue #6): rounds 5/10/20 (default 10), board size 200/300/500 (default 300).
-- create_game accepts only the new options. The table keeps the old values valid too, so games created
-- before this change (and their rematches, which copy the settings) keep working.

alter table public.games drop constraint games_rounds_per_player_check;
alter table public.games add constraint games_rounds_per_player_check
  check (rounds_per_player in (3, 5, 10, 20));
alter table public.games drop constraint games_board_size_check;
alter table public.games add constraint games_board_size_check
  check (board_size in (100, 200, 300, 500));

create or replace function public.create_game(rounds int, board_size int)
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
  if v_rounds is null or v_rounds not in (5, 10, 20) then perform private.err('invalid_argument'); end if;
  if v_size is null or v_size not in (200, 300, 500) then perform private.err('invalid_argument'); end if;
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
