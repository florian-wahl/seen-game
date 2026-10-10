-- Web push subscription management (Milestone 6). Clients never touch the
-- table directly (select-only RLS); they go through these two RPCs.

-- Upsert the caller's subscription for this endpoint (keys may rotate).
create function public.save_push_subscription(endpoint text, p256dh text, auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;
  if coalesce(endpoint, '') = '' or coalesce(p256dh, '') = '' or coalesce(auth, '') = '' then
    perform private.err('invalid_argument');
  end if;
  if endpoint !~ '^https://' or char_length(endpoint) > 2048 then
    perform private.err('invalid_argument');
  end if;

  insert into public.push_subscriptions as ps (user_id, endpoint, p256dh, auth)
  values (v_uid, endpoint, p256dh, auth)
  on conflict on constraint push_subscriptions_user_id_endpoint_key do update
    set p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- Remove the caller's subscription for this endpoint (no-op if absent).
create function public.delete_push_subscription(endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then perform private.err('not_authenticated'); end if;
  delete from public.push_subscriptions ps where ps.user_id = v_uid and ps.endpoint = delete_push_subscription.endpoint;
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text)
  from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text)
  to authenticated;
