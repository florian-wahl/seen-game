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
  -- skip the 1.2 s draw reveal (taps before drawn_at are uncounted): backdate a fresh draw
  if r ->> 'already_drawn' = 'false' then
    update public.turns set drawn_at = drawn_at - interval '1200 ms', deadline_at = deadline_at - interval '1200 ms'
     where id = (r ->> 'turn_id')::uuid;
    r := r || (select jsonb_build_object('drawn_at', t.drawn_at, 'deadline_at', t.deadline_at)
                 from public.turns t where t.id = (r ->> 'turn_id')::uuid);
  end if;
  return r;
end $$;

-- draw WITHOUT skipping the reveal (tests of the reveal window itself)
create function tests.draw_raw(gid uuid) returns jsonb language plpgsql as $$
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

select tests.put('gid', tests.new_game(3, 3, 100)::text);
select tests.mkusers(4);

-- ------------------------------------------------------- out-of-turn draw
select tests.login((select n from generate_series(1,3) n where n <> tests.cur(tests.gid()) limit 1));
select throws_ok(format('select public.draw_target(%L)', tests.gid()), 'SN004', 'not_your_turn', 'non-current player cannot draw');
select tests.logout();
select tests.login(4);
select throws_ok(format('select public.draw_target(%L)', tests.gid()), 'SN002', 'not_a_member', 'outsider cannot draw');
select tests.logout();

-- tapping a pending turn
select tests.login(tests.cur(tests.gid()));
select throws_ok(format('select public.submit_tap(%L, ''p0001'', 1, 0)', tests.cur_turn(tests.gid())),
                 'SN012', 'turn_not_live', 'cannot tap before drawing');
select tests.logout();

-- ----------------------------------------- draw twice -> same target/deadline
select tests.put('d1', tests.draw(tests.gid())::text);
select tests.put('d2', tests.draw(tests.gid())::text);
select is((tests.get('d1')::jsonb ->> 'target_picture_id'), (tests.get('d2')::jsonb ->> 'target_picture_id'),
          'second draw returns same target');
select is((tests.get('d1')::jsonb ->> 'deadline_at'), (tests.get('d2')::jsonb ->> 'deadline_at'),
          'second draw returns same deadline');
select is((tests.get('d1')::jsonb ->> 'already_drawn'), 'false', 'first draw already_drawn=false');
select is((tests.get('d2')::jsonb ->> 'already_drawn'), 'true', 'second draw already_drawn=true');
select is(jsonb_array_length(tests.get('d1')::jsonb -> 'tiles'), 100, 'draw returns all tiles');
select is((select deadline_at - drawn_at from public.turns where id = tests.cur_turn(tests.gid())),
          interval '90 seconds', 'deadline = draw + cap');

-- invalid picture
select tests.login(tests.cur(tests.gid()));
select throws_ok(format('select public.submit_tap(%L, ''nope'', 1, 0)', tests.cur_turn(tests.gid())),
                 'SN014', 'invalid_picture', 'picture must be on the board');
-- a different member cannot tap my turn
select tests.logout();
select tests.login((select n from generate_series(1,3) n where n <> tests.cur(tests.gid()) limit 1));
select throws_ok(format('select public.submit_tap(%L, ''p0001'', 1, 0)', tests.cur_turn(tests.gid())),
                 'SN004', 'not_your_turn', 'other member cannot tap my turn');
select tests.logout();
select tests.login(4);
select throws_ok(format('select public.submit_tap(%L, ''p0001'', 1, 0)', tests.cur_turn(tests.gid())),
                 'SN011', 'turn_not_found', 'outsider cannot tap');
select tests.logout();

-- ---------------------------------------------- wrong tap moves deadline
select tests.put('t1', tests.cur_turn(tests.gid())::text);
select tests.put('u1', tests.cur(tests.gid())::text);
select is((tests.tap(tests.gid(), tests.wrong_pic(tests.gid()), 1) -> 'turn' ->> 'wrong_taps'), '1', 'wrong tap -> wrong_taps 1');
select is((select deadline_at - drawn_at from public.turns where id = tests.get('t1')::uuid),
          interval '85 seconds', 'wrong tap pulls deadline in by 5 s');
select is((select status::text from public.turns where id = tests.get('t1')::uuid), 'live', 'still live after wrong tap');

-- ----------------------------------------------------------- score formula
-- 10 s elapsed + 1 wrong tap (5 s) = ~15 s
select tests.age(tests.gid(), interval '10 seconds');
select tests.put('r', tests.tap(tests.gid(), tests.target(tests.gid()), 2)::text);
select is(tests.get('r')::jsonb -> 'turn' ->> 'status', 'found', 'correct tap -> found');
select ok((tests.get('r')::jsonb -> 'turn' ->> 'score_ms')::int between 15000 and 17000,
          'score = elapsed + 5 s penalty (got ' || (tests.get('r')::jsonb -> 'turn' ->> 'score_ms') || ')');
select is((select total_ms from public.game_players where game_id = tests.gid() and user_id = tests.u(tests.get('u1')::int)),
          (tests.get('r')::jsonb -> 'turn' ->> 'score_ms')::bigint, 'score added to player total');
select is((select wrong_taps from public.game_players where game_id = tests.gid() and user_id = tests.u(tests.get('u1')::int)),
          1, 'wrong taps added to player total');
select is((select turns_done from public.game_players where game_id = tests.gid() and user_id = tests.u(tests.get('u1')::int)),
          1, 'turns_done incremented');
select is((select count(*)::int from public.turns where game_id = tests.gid() and status = 'pending'), 1, 'next turn is pending');
select is((select count(*)::int from public.notification_outbox where kind = 'your_turn' and game_id = tests.gid()), 2, 'your_turn queued for next player');

-- ------------------------------------------ 3 wrong taps -> deadline at 75 s
select tests.draw(tests.gid());
select tests.put('t2', tests.cur_turn(tests.gid())::text);
select tests.tap(tests.gid(), tests.wrong_pic(tests.gid()), 1);
select tests.tap(tests.gid(), tests.wrong_pic(tests.gid()), 2);
select tests.tap(tests.gid(), tests.wrong_pic(tests.gid()), 3);
select is((select deadline_at - drawn_at from public.turns where id = tests.get('t2')::uuid),
          interval '75 seconds', 'after 3 wrong taps the deadline is 75 s');

-- correct tap after the deadline: capped, 90000, tap not counted
select tests.age(tests.gid(), interval '80 seconds');
select tests.put('r2', tests.tap(tests.gid(), tests.target(tests.gid()), 4)::text);
select is(tests.get('r2')::jsonb -> 'turn' ->> 'status', 'capped', 'correct tap after deadline closes capped');
select is((tests.get('r2')::jsonb -> 'turn' ->> 'score_ms')::int, 90000, 'capped score is 90000');
select is((tests.get('r2')::jsonb ->> 'counted')::boolean, false, 'late tap not counted');
select is((select counted from public.taps where turn_id = tests.get('t2')::uuid and client_seq = 4), false, 'late tap stored as not counted');
select is((select wrong_taps from public.turns where id = tests.get('t2')::uuid), 3, 'wrong taps remain 3');

-- ------------------------------ wrong tap pulling deadline to <= now caps
select tests.draw(tests.gid());
select tests.put('t3', tests.cur_turn(tests.gid())::text);
select tests.age(tests.gid(), interval '86 seconds');   -- 4 s left, penalty is 5 s
select tests.put('r3', tests.tap(tests.gid(), tests.wrong_pic(tests.gid()), 1)::text);
select is(tests.get('r3')::jsonb -> 'turn' ->> 'status', 'capped', 'wrong tap past the cap closes capped immediately');
select is((tests.get('r3')::jsonb -> 'turn' ->> 'score_ms')::int, 90000, 'capped by wrong tap scores 90000');
select is((tests.get('r3')::jsonb ->> 'counted')::boolean, true, 'that wrong tap itself counted');

-- ----------------------------------- repeated client_seq counted once
select tests.draw(tests.gid());
select tests.put('t4', tests.cur_turn(tests.gid())::text);
select tests.put('u4', tests.cur(tests.gid())::text);
select tests.put('p', tests.wrong_pic(tests.gid()));
select tests.put('a', tests.tap(tests.gid(), tests.get('p'), 7)::text);
select tests.put('b', tests.tap(tests.gid(), tests.get('p'), 7)::text);
select is((select wrong_taps from public.turns where id = tests.get('t4')::uuid), 1, 'repeated client_seq counted once');
select is((tests.get('b')::jsonb ->> 'replayed')::boolean, true, 'repeat flagged as replay');
select is(tests.get('b')::jsonb -> 'turn', tests.get('a')::jsonb -> 'turn', 'replay returns the earlier result');
select is((select count(*)::int from public.taps where turn_id = tests.get('t4')::uuid), 1, 'one tap row');

-- correct tap, then retry of that seq after the turn closed still returns the result
select tests.put('c', tests.tap(tests.gid(), tests.target(tests.gid()), 8)::text);
select tests.login(tests.get('u4')::int);
select is((public.submit_tap(tests.get('t4')::uuid, tests.get('c')::jsonb ->> 'picture_id', 8, 0) ->> 'replayed')::boolean, true,
          'retry after close returns earlier result');
select tests.logout();

-- ---------------------------------------- lazy close of an expired live turn
select tests.draw(tests.gid());
select tests.put('t5', tests.cur_turn(tests.gid())::text);
select tests.put('u5', tests.cur(tests.gid())::text);
select tests.age(tests.gid(), interval '100 seconds');
select tests.login(tests.get('u5')::int);
select is((public.game_state(tests.gid()) -> 'turns' -> 4 ->> 'status'), 'capped', 'game_state lazily caps expired live turn');
select tests.logout();
select is((select score_ms from public.turns where id = tests.get('t5')::uuid), 90000, 'lazily capped turn scores 90000');

-- ------------------------------------------------------------ draw reveal
-- drawn_at is the official start = draw time + 1.2 s; the clock (and deadline) follow it
select tests.put('dr', tests.draw_raw(tests.gid())::text);
select tests.put('t6', tests.cur_turn(tests.gid())::text);
select ok((select t.drawn_at - (tests.get('dr')::jsonb ->> 'server_now')::timestamptz
             from public.turns t where t.id = tests.get('t6')::uuid) between interval '1000 ms' and interval '1200 ms',
          'drawn_at = draw time + 1.2 s reveal');
select is((tests.get('dr')::jsonb ->> 'drawn_at')::timestamptz,
          (select drawn_at from public.turns where id = tests.get('t6')::uuid), 'draw_target returns the official drawn_at');
select is((select deadline_at - drawn_at from public.turns where id = tests.get('t6')::uuid),
          interval '90 seconds', 'deadline = drawn_at + cap');

-- taps during the reveal: recorded, uncounted, no penalty, turn stays live
select tests.put('dl', (select deadline_at::text from public.turns where id = tests.get('t6')::uuid));
select tests.put('w', tests.tap(tests.gid(), tests.wrong_pic(tests.gid()), 1)::text);
select is((tests.get('w')::jsonb ->> 'counted')::boolean, false, 'wrong tap during reveal is not counted');
select is(tests.get('w')::jsonb -> 'turn' ->> 'wrong_taps', '0', 'reveal tap: no penalty in the result');
select is((select wrong_taps from public.turns where id = tests.get('t6')::uuid), 0, 'reveal tap: wrong_taps unchanged');
select is((select deadline_at::text from public.turns where id = tests.get('t6')::uuid), tests.get('dl'), 'reveal tap: deadline unchanged');
select tests.put('w2', tests.tap(tests.gid(), tests.target(tests.gid()), 2)::text);
select is((tests.get('w2')::jsonb ->> 'counted')::boolean, false, 'correct tap during reveal is not counted');
select is(tests.get('w2')::jsonb -> 'turn' ->> 'status', 'live', 'correct tap during reveal does not close the turn');
select is((select count(*)::int from public.taps where turn_id = tests.get('t6')::uuid and not counted), 2, 'reveal taps stored uncounted');

-- 3 s after the draw = 1.8 s after drawn_at: the score counts from drawn_at
select tests.age(tests.gid(), interval '3 seconds');
select tests.put('r6', tests.tap(tests.gid(), tests.target(tests.gid()), 3)::text);
select is(tests.get('r6')::jsonb -> 'turn' ->> 'status', 'found', 'correct tap after drawn_at -> found');
select ok((tests.get('r6')::jsonb -> 'turn' ->> 'score_ms')::int between 1700 and 2400,
          'score counts from drawn_at (got ' || (tests.get('r6')::jsonb -> 'turn' ->> 'score_ms') || ')');

select * from finish();
rollback;
