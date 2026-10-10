-- Notification outbox delivery (pg_net), sweep_turns, pg_cron schedule.

-- POST one outbox row to the notify endpoint. URL and shared secret come from
-- Supabase Vault secrets `notify_url` and `notify_secret`; if either is missing
-- (or anything goes wrong) this quietly does nothing - gameplay never fails
-- because of notifications. Returns true when a request was queued.
create function private.post_outbox(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  r public.notification_outbox;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'notify_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'notify_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return false;
  end if;

  select * into r from public.notification_outbox o where o.id = p_id and o.sent_at is null;
  if not found then
    return false;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'user_id', r.user_id, 'game_id', r.game_id,
      'payload', r.payload, 'created_at', r.created_at),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret)
  );

  update public.notification_outbox o
     set attempts = o.attempts + 1, last_attempt_at = clock_timestamp()
   where o.id = p_id;
  return true;
exception when others then
  raise warning 'post_outbox(%) failed: %', p_id, sqlerrm;
  return false;
end;
$$;

create function private.outbox_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.post_outbox(new.id);
  return null;
end;
$$;

create trigger notification_outbox_post
  after insert on public.notification_outbox
  for each row execute function private.outbox_after_insert();

revoke execute on function private.post_outbox(bigint), private.outbox_after_insert()
  from public, anon, authenticated;

-- ------------------------------------------------------------- sweep_turns
-- Run every minute by pg_cron (as postgres). Not callable by clients.
--  * caps live turns past their deadline
--  * pending turns: forfeit at 72 h, otherwise reminder at 24 h (once)
--  * abandons lobbies idle for 7 days
--  * re-POSTs outbox rows unsent for > 5 minutes (max 10 attempts)
-- returns {capped, forfeited, reminded, abandoned, retried}
create function public.sweep_turns()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  t public.turns;
  v_cap int;
  v_capped int := 0;
  v_forfeited int := 0;
  v_reminded int := 0;
  v_abandoned int := 0;
  v_retried int := 0;
  v_now timestamptz := clock_timestamp();
begin
  -- 1. expired live turns + 72 h forfeits
  for r in
    select distinct x.game_id
      from public.turns x
     where (x.status = 'live' and x.deadline_at <= v_now)
        or (x.status = 'pending' and x.became_current_at <= v_now - interval '72 hours')
  loop
    perform 1 from public.games g where g.id = r.game_id and g.status = 'in_progress' for update;
    if not found then continue; end if;

    if private.close_if_expired(r.game_id) then
      v_capped := v_capped + 1;
    end if;

    select * into t from public.turns x
     where x.game_id = r.game_id and x.status = 'pending'
       and x.became_current_at <= clock_timestamp() - interval '72 hours'
     for update;
    if found then
      select g.cap_ms into v_cap from public.games g where g.id = r.game_id;
      perform private.close_turn(t.id, 'forfeited', v_cap, clock_timestamp(), true);
      v_forfeited := v_forfeited + 1;
    end if;
  end loop;

  -- 2. 24 h reminders
  for r in
    select x.id, x.game_id from public.turns x
     where x.status = 'pending' and x.reminded_at is null
       and x.became_current_at <= v_now - interval '24 hours'
  loop
    perform 1 from public.games g where g.id = r.game_id and g.status = 'in_progress' for update;
    if not found then continue; end if;
    update public.turns x set reminded_at = clock_timestamp()
     where x.id = r.id and x.status = 'pending' and x.reminded_at is null
     returning * into t;
    if found then
      perform private.queue_notification('reminder', t.user_id, t.game_id,
        jsonb_build_object('turn_id', t.id, 'round', t.round));
      v_reminded := v_reminded + 1;
    end if;
  end loop;

  -- 3. idle lobbies
  update public.games g set status = 'abandoned'
   where g.status = 'lobby' and g.last_activity_at <= v_now - interval '7 days';
  get diagnostics v_abandoned = row_count;

  -- 4. outbox retries
  for r in
    select o.id from public.notification_outbox o
     where o.sent_at is null and o.attempts < 10
       and coalesce(o.last_attempt_at, o.created_at) <= v_now - interval '5 minutes'
     order by o.id
     limit 200
  loop
    if private.post_outbox(r.id) then
      v_retried := v_retried + 1;
    end if;
  end loop;

  return jsonb_build_object('capped', v_capped, 'forfeited', v_forfeited, 'reminded', v_reminded,
                            'abandoned', v_abandoned, 'retried', v_retried);
end;
$$;

revoke execute on function public.sweep_turns() from public, anon, authenticated;
grant execute on function public.sweep_turns() to service_role;

select cron.schedule('seen-sweep-turns', '* * * * *', 'select public.sweep_turns()');
