-- Realtime per game: private Broadcast on topic `game:<game_id>`, event `changed`,
-- payload {game_id, table}. No game data is ever sent; clients re-fetch game_state.

create function private.broadcast_game_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
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
  return null;
end $$;

revoke execute on function private.broadcast_game_changed() from public, anon, authenticated;

-- Transition tables cannot be shared across events, so one trigger per event.
do $$
declare
  t record;
begin
  for t in select * from (values ('games', 'id'), ('game_players', 'game_id'), ('turns', 'game_id')) v(tbl, col) loop
    execute format($f$create trigger rt_%1$s_ins after insert on public.%1$s
      referencing new table as new_rows for each statement
      execute function private.broadcast_game_changed(%2$L)$f$, t.tbl, t.col);
    execute format($f$create trigger rt_%1$s_upd after update on public.%1$s
      referencing new table as new_rows old table as old_rows for each statement
      execute function private.broadcast_game_changed(%2$L)$f$, t.tbl, t.col);
    execute format($f$create trigger rt_%1$s_del after delete on public.%1$s
      referencing old table as old_rows for each statement
      execute function private.broadcast_game_changed(%2$L)$f$, t.tbl, t.col);
  end loop;
end $$;

-- Only members of a game may receive its topic. No insert policy: clients cannot send.
create function private.can_receive_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_topic ~ '^game:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     and private.is_member(substr(p_topic, 6)::uuid);
$$;
revoke execute on function private.can_receive_topic(text) from public, anon;
grant execute on function private.can_receive_topic(text) to authenticated;

create policy "game members receive game broadcasts" on realtime.messages
  for select to authenticated
  using (extension = 'broadcast' and (select private.can_receive_topic((select realtime.topic()))));
