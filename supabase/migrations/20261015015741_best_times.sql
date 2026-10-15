-- Best times (issue #16): the caller's lowest total per game type (rounds × pictures), for the
-- profile page. Counts finished games where the caller was still active at the end and had no
-- forfeited turn; only the current options (5/10/20 rounds × 200/300/500 pictures).
-- Monochrome and Scattered games count in the same type as plain games.

create function public.my_best_times()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'rounds', b.rounds, 'board_size', b.board_size, 'best_ms', b.best_ms, 'games', b.games)
             order by b.rounds, b.board_size)
      from (select g.rounds_per_player as rounds, g.board_size,
                   min(gp.total_ms)::bigint as best_ms, count(*)::int as games
              from public.game_players gp
              join public.games g on g.id = gp.game_id
             where gp.user_id = v_uid
               and gp.status = 'active'
               and g.status = 'finished'
               and g.rounds_per_player in (5, 10, 20)
               and g.board_size in (200, 300, 500)
               and not exists (select 1 from public.turns t
                                where t.game_id = g.id and t.user_id = v_uid and t.status = 'forfeited')
             group by g.rounds_per_player, g.board_size) b
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.my_best_times() from public, anon, authenticated;
grant execute on function public.my_best_times() to authenticated;
