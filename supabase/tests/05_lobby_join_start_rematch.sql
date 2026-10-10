begin;
create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------- test helpers
-- (rolled back with the transaction; nothing here exists in production)
create schema tests;
grant usage on schema tests to public;

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

select tests.mkusers(8);
select tests.seed_pictures();

-- ============================================================ create_game
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select throws_ok('select public.create_game(5, 200)', 'SN001', 'not_authenticated', 'create_game needs a signed-in user');
select tests.logout();

select tests.login(1);
select throws_ok('select public.create_game(4, 200)', 'SN010', 'invalid_argument', 'rounds must be 3/5/10');
select throws_ok('select public.create_game(5, 150)', 'SN010', 'invalid_argument', 'board size must be 100/200/300');
select tests.put('g', public.create_game(5, 200)::text);
select tests.logout();
select matches(tests.get('g')::jsonb ->> 'token', '^[A-Za-z0-9_-]{22}$', 'token is 22 url-safe chars');
select ok((tests.get('g')::jsonb ->> 'expires_at')::timestamptz between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour',
          'invite expires in 7 days');
select tests.put('gid', tests.get('g')::jsonb ->> 'game_id');
select is((select row(status, rounds_per_player, board_size, penalty_ms, cap_ms, host_id)::text from public.games where id = tests.gid()),
          row('lobby', 5, 200, 5000, 90000, tests.u(1))::text, 'game row defaults and constants');
select is((select count(*)::int from public.game_players where game_id = tests.gid() and user_id = tests.u(1)), 1, 'host is a player');

-- ================================================================ join_game
select tests.login(2);
select throws_ok($q$select public.join_game('does-not-exist-123456')$q$, 'SN009', 'invite_not_found', 'unknown token');
select tests.put('j', public.join_game(tests.get('g')::jsonb ->> 'token')::text);
select is(tests.get('j')::jsonb ->> 'already_member', 'false', 'join succeeds');
select is((public.join_game(tests.get('g')::jsonb ->> 'token') ->> 'already_member'), 'true', 'join is idempotent');
select tests.logout();
select is((select count(*)::int from public.game_players where game_id = tests.gid()), 2, 'idempotent join adds no row');

-- expired
update public.invites set expires_at = now() - interval '1 second' where game_id = tests.gid();
select tests.login(3);
select throws_ok(format('select public.join_game(%L)', tests.get('g')::jsonb ->> 'token'), 'SN008', 'invite_expired', 'expired invite rejected');
select tests.logout();
select tests.login(2);
select is((public.join_game(tests.get('g')::jsonb ->> 'token') ->> 'already_member'), 'true', 'existing member unaffected by expiry');
select tests.logout();
update public.invites set expires_at = now() + interval '1 day' where game_id = tests.gid();

-- full at 6
select tests.login(3); select public.join_game(tests.get('g')::jsonb ->> 'token'); select tests.logout();
select tests.login(4); select public.join_game(tests.get('g')::jsonb ->> 'token'); select tests.logout();
select tests.login(5); select public.join_game(tests.get('g')::jsonb ->> 'token'); select tests.logout();
select tests.login(6); select public.join_game(tests.get('g')::jsonb ->> 'token'); select tests.logout();
select is((select count(*)::int from public.game_players where game_id = tests.gid()), 6, 'six players in lobby');
select tests.login(7);
select throws_ok(format('select public.join_game(%L)', tests.get('g')::jsonb ->> 'token'), 'SN007', 'lobby_full', 'lobby full at 6');
select tests.logout();

-- ======================================================= start_game_internal
select throws_ok(format('select public.start_game_internal(%L, %L::jsonb)', tests.gid(), '[]'), 'SN010', 'invalid_argument', 'wrong tile count');
select throws_ok(format('select public.start_game_internal(%L, %L::jsonb)', tests.gid(),
                        (select jsonb_agg(jsonb_build_object('pictureId', 'p0001', 'x', 1, 'y', 1, 'rotation', 0, 'scale', 1))
                           from generate_series(1, 200))), 'SN010', 'invalid_argument', 'duplicate pictures rejected');
select throws_ok(format('select public.start_game_internal(%L, %L::jsonb)', tests.gid(),
                        (select jsonb_agg(jsonb_build_object('pictureId', 'zz' || i, 'x', 1, 'y', 1, 'rotation', 0, 'scale', 1))
                           from generate_series(1, 200) i)), 'SN010', 'invalid_argument', 'unknown pictures rejected');
select throws_ok(format('select public.start_game_internal(%L, %L::jsonb)', gen_random_uuid(), '[]'), 'SN003', 'game_not_found', 'unknown game');
select tests.put('s', public.start_game_internal(tests.gid(), tests.tiles(200))::text);
select is((select status::text from public.games where id = tests.gid()), 'in_progress', 'game started');
select is((select count(*)::int from public.board_tiles where game_id = tests.gid()), 200, '200 tiles stored');
select is((select array_agg(seat order by seat) from public.game_players where game_id = tests.gid()), array[1,2,3,4,5,6], 'six distinct seats');
select is((select count(*)::int from public.turns where game_id = tests.gid() and seq = 1 and status = 'pending'), 1, 'first pending turn created');
select ok((select abs(extract(epoch from (now() - became_current_at))) < 5 from public.turns where game_id = tests.gid() and seq = 1),
          'became_current_at set at start');
select is((select count(*)::int from public.notification_outbox where kind = 'your_turn' and game_id = tests.gid()), 1, 'your_turn queued');
select throws_ok(format('select public.start_game_internal(%L, %L::jsonb)', tests.gid(), tests.tiles(200)::text), 'SN006', 'game_not_in_lobby', 'cannot start twice');

-- cannot join after start; members still get idempotent answer
select tests.login(8);
select throws_ok(format('select public.join_game(%L)', tests.get('g')::jsonb ->> 'token'), 'SN006', 'game_not_in_lobby', 'no joining after start');
select tests.logout();
select tests.login(2);
select is((public.join_game(tests.get('g')::jsonb ->> 'token') ->> 'already_member'), 'true', 'member re-opening invite after start is fine');
select tests.logout();

-- fewer than 2 players
select tests.login(8);
select tests.put('solo', public.create_game(3, 100) ->> 'game_id');
select tests.logout();
select throws_ok(format('select public.start_game_internal(%L, %L::jsonb)', tests.get('solo')::uuid, tests.tiles(100)::text),
                 'SN015', 'not_enough_players', 'need at least 2 players');

-- ======================================================= leaving the lobby
select tests.login(7);
select tests.put('l', public.create_game(3, 100)::text);
select tests.logout();
select tests.login(6);
select public.join_game(tests.get('l')::jsonb ->> 'token');
select is(public.retire((tests.get('l')::jsonb ->> 'game_id')::uuid) ->> 'status', 'lobby', 'non-host leaves lobby');
select tests.logout();
select is((select count(*)::int from public.game_players where game_id = (tests.get('l')::jsonb ->> 'game_id')::uuid), 1, 'leaver removed from lobby');
select tests.login(7);
select is(public.retire((tests.get('l')::jsonb ->> 'game_id')::uuid) ->> 'status', 'abandoned', 'host leaving abandons the lobby');
select tests.logout();
select tests.login(5);
select throws_ok(format('select public.join_game(%L)', tests.get('l')::jsonb ->> 'token'), 'SN006', 'game_not_in_lobby', 'cannot join abandoned game');
select throws_ok(format('select public.retire(%L)', tests.get('l')::jsonb ->> 'game_id'), 'SN002', 'not_a_member', 'non-member cannot retire');
select tests.logout();

-- ===================================================================== rematch
select tests.put('gid', tests.new_game(3, 3, 100)::text);
select tests.retire(tests.gid(), 3);
select tests.play_found(tests.gid()) from generate_series(1, 2);
select tests.login(2);
select throws_ok(format('select public.rematch(%L)', tests.gid()), 'SN013', 'game_not_finished', 'rematch needs a finished game');
select tests.logout();
select tests.play_found(tests.gid()) from generate_series(1, 4);
select is((select status::text from public.games where id = tests.gid()), 'finished', 'precondition: game finished');

select tests.login(4);
select throws_ok(format('select public.rematch(%L)', tests.gid()), 'SN002', 'not_a_member', 'outsider cannot rematch');
select tests.logout();

select tests.login(2);
select tests.put('rm', public.rematch(tests.gid())::text);
select tests.logout();
select tests.put('rgid', tests.get('rm')::jsonb ->> 'game_id');
select is((select row(status, rounds_per_player, board_size, host_id)::text from public.games where id = tests.get('rgid')::uuid),
          row('lobby', 3, 100, tests.u(2))::text, 'rematch: new lobby, same settings, caller hosts');
select is((select array_agg(user_id order by user_id) from public.game_players where game_id = tests.get('rgid')::uuid),
          array[tests.u(1), tests.u(2)], 'rematch: previous non-retired players added, retired one not');
select matches(tests.get('rm')::jsonb ->> 'token', '^[A-Za-z0-9_-]{22}$', 'rematch returns a fresh invite token');
select is((select count(*)::int from public.invites where token = tests.get('rm')::jsonb ->> 'token' and game_id = tests.get('rgid')::uuid), 1,
          'rematch invite stored');
select isnt(tests.get('rm')::jsonb ->> 'token', tests.get('g')::jsonb ->> 'token', 'new token differs');
select tests.login(3);   -- the retired player can still join via the new link
select is(public.join_game(tests.get('rm')::jsonb ->> 'token') ->> 'already_member', 'false', 'others join the rematch via invite');
select tests.logout();

-- ==================================================================== profile
select tests.login(1);
select is(public.update_profile('  Ada  ', null) ->> 'display_name', 'Ada', 'update_profile trims and sets name');
select is((select display_name from public.profiles where id = tests.u(1)), 'Ada', 'profile updated');
select tests.logout();

select * from finish();
rollback;
