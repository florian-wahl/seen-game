begin;
create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------- test helpers
-- (rolled back with the transaction; nothing here exists in production)
create schema tests;
grant usage on schema tests to public;

-- A dev stack may have Vault secrets from `npm run db:setup-notify`; clear them (rolled back with the transaction).
delete from vault.secrets where name in ('notify_url', 'notify_secret');

create function tests.u(n int) returns uuid language sql immutable as
$$ select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

create function tests.n(uid uuid) returns int language sql immutable as
$$ select right(uid::text, 12)::int $$;

create function tests.mkusers(n int) returns void language plpgsql as $$
begin
  for i in 1..n loop
    insert into auth.users (id, email, aud, role, raw_user_meta_data)
    values (tests.u(i), 'user' || i || '@example.com', 'authenticated', 'authenticated', '{}'::jsonb)
    on conflict (id) do nothing;
  end loop;
end $$;

create function tests.login(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.u(n), 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function tests.logout() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

create function tests.seed_pictures(n int default 400) returns void language sql as $$
  insert into public.pictures (id, name, category, file_path, review_status)
  select 'p' || lpad(i::text, 4, '0'), 'Pic ' || i, 'cat' || (i % 10), 'p' || i || '.svg', 'approved'
  from generate_series(1, n) i
  on conflict do nothing;
$$;

create function tests.tiles(n int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
    'pictureId', 'p' || lpad(i::text, 4, '0'), 'x', (i % 15) * 100 + 50, 'y', (i / 15) * 100 + 50,
    'rotation', 0, 'scale', 0.8) order by i)
  from generate_series(1, n) i;
$$;

-- users 1..nplayers; user 1 hosts and others join; game started. Returns game id.
create function tests.new_game(nplayers int, rounds int default 3, size int default 100)
returns uuid language plpgsql as $$
declare g jsonb; gid uuid;
begin
  perform tests.mkusers(nplayers);
  perform tests.seed_pictures();
  perform tests.login(1);
  g := public.create_game(rounds, size);
  gid := (g ->> 'game_id')::uuid;
  for i in 2..nplayers loop
    perform tests.login(i);
    perform public.join_game(g ->> 'token');
  end loop;
  perform tests.logout();
  perform public.start_game_internal(gid, tests.tiles(size));
  return gid;
end $$;

-- user number of whoever holds the open turn
create function tests.cur(gid uuid) returns int language sql security definer as $$
  select tests.n(t.user_id) from public.turns t where t.game_id = gid and t.status in ('pending', 'live')
$$;

create function tests.cur_turn(gid uuid) returns uuid language sql security definer as $$
  select t.id from public.turns t where t.game_id = gid and t.status in ('pending', 'live')
$$;

-- current player draws; returns draw_target result. Leaves role = postgres.
create function tests.draw(gid uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform tests.login(tests.cur(gid));
  r := public.draw_target(gid);
  perform tests.logout();
  return r;
end $$;

-- current player taps; leaves role = postgres
create function tests.tap(gid uuid, pic text, seq int default 1) returns jsonb language plpgsql as $$
declare r jsonb; tid uuid := tests.cur_turn(gid);
begin
  perform tests.login(tests.cur(gid));
  r := public.submit_tap(tid, pic, seq, 1000);
  perform tests.logout();
  return r;
end $$;

-- target of the current (live) turn
create function tests.target(gid uuid) returns text language sql security definer as $$
  select t.target_picture_id from public.turns t where t.game_id = gid and t.status = 'live'
$$;

-- a picture on the board that is not the current target
create function tests.wrong_pic(gid uuid) returns text language sql security definer as $$
  select bt.picture_id from public.board_tiles bt
  where bt.game_id = gid and bt.picture_id <> tests.target(gid) order by bt.picture_id limit 1
$$;

-- shift the open turn's timestamps into the past (simulates elapsed time)
create function tests.age(gid uuid, i interval) returns void language sql as $$
  update public.turns set
    became_current_at = became_current_at - i,
    drawn_at = drawn_at - i,
    deadline_at = deadline_at - i
  where game_id = gid and status in ('pending', 'live')
$$;

-- current player draws and finds the target immediately
create function tests.play_found(gid uuid) returns void language plpgsql as $$
begin
  perform tests.draw(gid);
  perform tests.tap(gid, tests.target(gid));
end $$;

create table tests.ctx (k text primary key, v text);
grant select on tests.ctx to public;
create function tests.put(k text, v text) returns void language sql security definer as
$$ insert into tests.ctx values (k, v) on conflict (k) do update set v = excluded.v $$;
create function tests.get(k text) returns text language sql stable as
$$ select v from tests.ctx c where c.k = get.k $$;
create function tests.gid() returns uuid language sql stable as $$ select tests.get('gid')::uuid $$;

create function tests.denied(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when insufficient_privilege then return true;
end $$;


create function tests.retire(gid uuid, n int) returns void language plpgsql as
$$ begin perform tests.login(n); perform public.retire(gid); perform tests.logout(); end $$;
select no_plan();

-- sweep_turns is global: neutralise rows left by local dev/e2e (rolled back at the end)
update public.notification_outbox set sent_at = now() where sent_at is null;
update public.games set status = 'abandoned' where status in ('lobby', 'in_progress');

-- ============================================================ 24 h reminder
select tests.put('gid', tests.new_game(3, 3, 100)::text);
select tests.put('t1', tests.cur_turn(tests.gid())::text);
select tests.put('u1', tests.cur(tests.gid())::text);

select public.sweep_turns();
select is((select reminded_at from public.turns where id = tests.get('t1')::uuid), null, 'no reminder before 24 h');

select tests.age(tests.gid(), interval '23 hours');
select public.sweep_turns();
select is((select count(*)::int from public.notification_outbox where kind = 'reminder' and game_id = tests.gid()), 0, 'no reminder at 23 h');

select tests.age(tests.gid(), interval '2 hours');   -- 25 h
select is((public.sweep_turns() ->> 'reminded')::int, 1, 'sweep reports one reminder');
select is((select count(*)::int from public.notification_outbox where kind = 'reminder' and user_id = tests.u(tests.get('u1')::int)), 1,
          'reminder queued for the waiting player');
select isnt((select reminded_at from public.turns where id = tests.get('t1')::uuid), null, 'reminded_at set');
select public.sweep_turns();
select is((select count(*)::int from public.notification_outbox where kind = 'reminder' and game_id = tests.gid()), 1, 'reminder sent only once');
select is((select status::text from public.turns where id = tests.get('t1')::uuid), 'pending', 'still pending at 25 h');

-- ============================================================ 72 h forfeit
select tests.age(tests.gid(), interval '48 hours');  -- 73 h
select is((public.sweep_turns() ->> 'forfeited')::int, 1, 'sweep reports one forfeit');
select is((select status::text from public.turns where id = tests.get('t1')::uuid), 'forfeited', 'turn forfeited at 72 h');
select is((select score_ms from public.turns where id = tests.get('t1')::uuid), 90000, 'forfeit scores 90000');
select is((select wrong_taps from public.turns where id = tests.get('t1')::uuid), 0, 'forfeit has 0 wrong taps');
select is((select total_ms from public.game_players where game_id = tests.gid() and user_id = tests.u(tests.get('u1')::int)), 90000::bigint,
          'forfeit adds 90000 to total');
select is((select turns_done from public.game_players where game_id = tests.gid() and user_id = tests.u(tests.get('u1')::int)), 1,
          'forfeit counts as a played turn');
select is((select count(*)::int from public.turns where game_id = tests.gid() and status = 'pending'), 1, 'next turn started');
select isnt(tests.cur(tests.gid()), tests.get('u1')::int, 'turn passed to the next player');

-- 72 h reached without any earlier sweep: forfeit only, no stale reminder for it
select tests.put('t2', tests.cur_turn(tests.gid())::text);
select tests.age(tests.gid(), interval '80 hours');
select public.sweep_turns();
select is((select status::text from public.turns where id = tests.get('t2')::uuid), 'forfeited', 'long-overdue turn forfeited');
select is((select reminded_at from public.turns where id = tests.get('t2')::uuid), null, 'no reminder for an already forfeited turn');

-- ===================================================== sweep caps live turns
select tests.draw(tests.gid());
select tests.put('t3', tests.cur_turn(tests.gid())::text);
select tests.age(tests.gid(), interval '95 seconds');
select is((public.sweep_turns() ->> 'capped')::int, 1, 'sweep caps one expired live turn');
select is((select status::text from public.turns where id = tests.get('t3')::uuid), 'capped', 'live turn capped by sweep');
select is((select score_ms from public.turns where id = tests.get('t3')::uuid), 90000, 'capped by sweep scores 90000');

-- a live turn that is NOT expired is left alone
select tests.draw(tests.gid());
select tests.put('t4', tests.cur_turn(tests.gid())::text);
select tests.age(tests.gid(), interval '30 seconds');
select public.sweep_turns();
select is((select status::text from public.turns where id = tests.get('t4')::uuid), 'live', 'unexpired live turn untouched');

-- ===================================== late tap after sweeper capped the turn
select tests.age(tests.gid(), interval '70 seconds');
select public.sweep_turns();
select tests.login(tests.n((select user_id from public.turns where id = tests.get('t4')::uuid)));
select is((public.submit_tap(tests.get('t4')::uuid, 'p0001', 1, 0) ->> 'counted')::boolean, false,
          'tap on a turn already capped is recorded but not counted');
select tests.logout();

-- ============================================================ idle lobby
select tests.mkusers(1);
select tests.login(1);
select tests.put('lobby', (public.create_game(3, 100) ->> 'game_id'));
select tests.logout();
update public.games set last_activity_at = now() - interval '8 days' where id = tests.get('lobby')::uuid;
select is((public.sweep_turns() ->> 'abandoned')::int, 1, 'idle lobby abandoned after 7 days');
select is((select status::text from public.games where id = tests.get('lobby')::uuid), 'abandoned', 'status abandoned');

-- ================================================ outbox trigger / retries
select is((select count(*)::int from vault.decrypted_secrets where name in ('notify_url', 'notify_secret')), 0, 'no vault secrets by default');
select lives_ok($q$insert into public.notification_outbox (kind, user_id, game_id) values ('your_turn', tests.u(1), tests.get('lobby')::uuid)$q$,
                'outbox insert without secrets does nothing and does not fail');
select is((select max(attempts) from public.notification_outbox where game_id = tests.get('lobby')::uuid), 0, 'no POST attempted without secrets');

select vault.create_secret('http://127.0.0.1:9/api/jobs/notify', 'notify_url');
select vault.create_secret('s3cret', 'notify_secret');
insert into public.notification_outbox (kind, user_id, game_id, payload)
values ('your_turn', tests.u(1), tests.get('lobby')::uuid, '{"x":1}');
select is((select attempts from public.notification_outbox where payload = '{"x":1}'), 1, 'insert trigger POSTs once when secrets exist');
select is((select count(*)::int from net.http_request_queue), 1, 'pg_net request queued');
select is((select (headers ->> 'Authorization') from net.http_request_queue limit 1), 'Bearer s3cret', 'bearer secret sent');

-- retry only after 5 minutes unsent
select is((public.sweep_turns() ->> 'retried')::int, 0, 'fresh unsent rows not retried');
update public.notification_outbox set last_attempt_at = now() - interval '6 minutes' where payload = '{"x":1}';
select is((public.sweep_turns() ->> 'retried')::int, 1, 'unsent > 5 min re-POSTed');
select is((select attempts from public.notification_outbox where payload = '{"x":1}'), 2, 'attempts incremented');
update public.notification_outbox set sent_at = now(), last_attempt_at = now() - interval '6 minutes' where payload = '{"x":1}';
select is((public.sweep_turns() ->> 'retried')::int, 0, 'sent rows are not retried');

-- cron job registered
select is((select count(*)::int from cron.job where command = 'select public.sweep_turns()' and schedule = '* * * * *'), 1,
          'pg_cron runs sweep_turns every minute');

select * from finish();
rollback;
