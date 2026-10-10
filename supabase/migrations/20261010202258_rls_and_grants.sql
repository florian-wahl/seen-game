-- Profile trigger, RLS helpers, RLS policies, grants, turns_public view.

-- ---------------------------------------------------------------- profiles
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, ''), '@', 1)
  )), '');
  v_name := left(coalesce(v_name, 'Player'), 60);
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, v_name, new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- --------------------------------------------------------------- helpers
create function private.is_member(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game_id and gp.user_id = (select auth.uid())
  );
$$;

create function private.is_host(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id and g.host_id = (select auth.uid())
  );
$$;

create function private.board_unlocked(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game_id
      and gp.user_id = (select auth.uid())
      and gp.board_unlocked_at is not null
  );
$$;

create function private.owns_turn(p_turn_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.turns t
    where t.id = p_turn_id and t.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_member(uuid), private.is_host(uuid),
  private.board_unlocked(uuid), private.owns_turn(uuid) from public, anon;
grant execute on function private.is_member(uuid), private.is_host(uuid),
  private.board_unlocked(uuid), private.owns_turn(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------- RLS
alter table public.profiles            enable row level security;
alter table public.pictures            enable row level security;
alter table public.picture_confusables enable row level security;
alter table public.games               enable row level security;
alter table public.game_players        enable row level security;
alter table public.invites             enable row level security;
alter table public.board_tiles         enable row level security;
alter table public.turns               enable row level security;
alter table public.taps                enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.notification_outbox enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy pictures_select on public.pictures
  for select to authenticated using (true);

create policy games_select on public.games
  for select to authenticated using ((select private.is_member(id)));

create policy game_players_select on public.game_players
  for select to authenticated using ((select private.is_member(game_id)));

create policy invites_select on public.invites
  for select to authenticated using ((select private.is_host(game_id)));

create policy board_tiles_select on public.board_tiles
  for select to authenticated using ((select private.board_unlocked(game_id)));

create policy taps_select on public.taps
  for select to authenticated using ((select private.owns_turn(turn_id)));

create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- picture_confusables, turns, notification_outbox: RLS on, no policy for
-- anon/authenticated => no client access (service_role bypasses RLS).

-- ---------------------------------------------------------------- grants
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles, public.pictures, public.games, public.game_players,
  public.invites, public.board_tiles, public.taps, public.push_subscriptions
  to authenticated;

-- ------------------------------------------------------------ turns_public
-- Owned by postgres, security_invoker OFF: it reads the locked-down `turns`
-- table as its owner, and filters rows itself with private.is_member() (which
-- keys on the caller's auth.uid()). target_picture_id is NULL until drawn.
create view public.turns_public
with (security_invoker = off, security_barrier = true)
as
select
  t.id,
  t.game_id,
  t.user_id,
  t.seq,
  t.round,
  t.status,
  t.became_current_at,
  t.drawn_at,
  t.deadline_at,
  t.ended_at,
  case when t.drawn_at is not null then t.target_picture_id end as target_picture_id,
  t.wrong_taps,
  t.score_ms,
  t.reminded_at
from public.turns t
where private.is_member(t.game_id);

revoke all on public.turns_public from public, anon, authenticated;
grant select on public.turns_public to authenticated;
