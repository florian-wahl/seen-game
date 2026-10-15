-- Realtime per user: the home page listens on the private Broadcast topic `user:<user_id>`
-- (event `changed`, payload {game_id, table}, like the game topic) so it can refresh itself.
--
-- Besides the existing `game:<game_id>` message, every statement that changes a game also sends one
-- message per (member, game) pair to `user:<member>`. For `game_players` changes the users in the
-- transition tables are notified too, so a player who was just removed (or added) hears about it.

create or replace function private.broadcast_game_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_pair record;
  v_extra text := '';
begin
  -- TG_ARGV[0] = column holding the game id on the table
  if tg_op = 'DELETE' then
    execute format('select coalesce(array_agg(distinct %I), ''{}'') from old_rows', tg_argv[0]) into v_ids;
  else
    execute format('select coalesce(array_agg(distinct %I), ''{}'') from new_rows', tg_argv[0]) into v_ids;
  end if;
  -- one message per distinct game per statement
  foreach v_id in array v_ids loop
    perform realtime.send(
      jsonb_build_object('game_id', v_id, 'table', tg_table_name),
      'changed', 'game:' || v_id::text, true);
  end loop;

  -- game_players: also the users whose rows changed (they may no longer be members)
  if tg_table_name = 'game_players' then
    if tg_op in ('DELETE', 'UPDATE') then
      v_extra := v_extra || ' union select user_id, game_id from old_rows';
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      v_extra := v_extra || ' union select user_id, game_id from new_rows';
    end if;
  end if;
  -- one message per distinct (user, game) pair per statement
  for v_pair in execute
    'select distinct user_id, game_id from (select user_id, game_id from public.game_players where game_id = any($1)'
    || v_extra || ') p where game_id = any($1)'
    using v_ids
  loop
    perform realtime.send(
      jsonb_build_object('game_id', v_pair.game_id, 'table', tg_table_name),
      'changed', 'user:' || v_pair.user_id::text, true);
  end loop;
  return null;
end $$;

revoke execute on function private.broadcast_game_changed() from public, anon, authenticated;

-- Members may receive their game's topic; a user may receive only their own `user:` topic.
create or replace function private.can_receive_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_topic ~ '^game:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then private.is_member(substr(p_topic, 6)::uuid)
    when p_topic ~ '^user:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then coalesce(substr(p_topic, 6)::uuid = (select auth.uid()), false)
    else false
  end;
$$;
revoke execute on function private.can_receive_topic(text) from public, anon;
grant execute on function private.can_receive_topic(text) to authenticated;
