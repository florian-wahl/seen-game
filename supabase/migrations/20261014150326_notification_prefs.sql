-- Notification preferences (issue #5): one on/off per channel, applying to every kind
-- (your_turn, reminder, game_finished). A missing row means both channels are on.
-- Kept out of `profiles`, which every signed-in user can read.

create table public.notification_prefs (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  email      boolean not null default true,
  push       boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy notification_prefs_select on public.notification_prefs
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.notification_prefs from anon, authenticated;
grant select on public.notification_prefs to authenticated;

-- Set the caller's preferences. A null argument leaves that channel unchanged.
create function public.set_notification_prefs(email boolean default null, push boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.notification_prefs;
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;
  if not exists (select 1 from public.profiles x where x.id = v_uid) then
    perform private.err('not_authenticated');
  end if;

  insert into public.notification_prefs as np (user_id, email, push)
  values (v_uid, coalesce(set_notification_prefs.email, true), coalesce(set_notification_prefs.push, true))
  on conflict (user_id) do update
    set email = coalesce(set_notification_prefs.email, np.email),
        push = coalesce(set_notification_prefs.push, np.push),
        updated_at = now()
  returning * into p;

  return jsonb_build_object('email', p.email, 'push', p.push);
end;
$$;

revoke execute on function public.set_notification_prefs(boolean, boolean) from public, anon, authenticated;
grant execute on function public.set_notification_prefs(boolean, boolean) to authenticated;
