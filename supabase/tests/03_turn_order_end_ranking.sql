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
  g := public.create_game(5, 200);
  gid := (g ->> 'game_id')::uuid;
  for i in 2..nplayers loop
    perform tests.login(i);
    perform public.join_game(g ->> 'token');
  end loop;
  perform tests.logout();
  -- Tests default to a short legacy game (3 rounds, 100 pictures) for speed. create_game only offers
  -- 5/10/20 and 200/300/500, but the table still accepts the old values, so set them directly.
  update public.games set rounds_per_player = rounds, board_size = size where id = gid;
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

create function tests.seat_user(gid uuid, s int) returns int language sql security definer as
$$ select tests.n(user_id) from public.game_players where game_id = gid and seat = s $$;
create function tests.seats(gid uuid) returns int[] language sql security definer as
$$ select array_agg(gp.seat order by t.seq) from public.turns t
   join public.game_players gp on gp.game_id = t.game_id and gp.user_id = t.user_id where t.game_id = gid $$;

-- =========================================================== round robin, 3 players
select tests.put('gid', tests.new_game(3, 3, 100)::text);
select is((select array_agg(seat order by seat) from public.game_players where game_id = tests.gid()), array[1,2,3],
          'start assigns seats 1..3');
select is(tests.seats(tests.gid()), array[1], 'first turn goes to seat 1');
select is((select started_at is not null and status = 'in_progress' from public.games where id = tests.gid()), true, 'game in_progress');

-- game_state before draw
select tests.login(tests.cur(tests.gid()));
select is((public.game_state(tests.gid()) ->> 'is_my_turn')::boolean, true, 'game_state: is my turn');
select is((public.game_state(tests.gid()) ->> 'board_unlocked')::boolean, false, 'game_state: board locked before draw');
select is((public.game_state(tests.gid()) -> 'current_turn' ->> 'target_picture_id'), null, 'game_state hides target before draw');
select tests.logout();
select tests.draw(tests.gid());
select tests.login(tests.cur(tests.gid()));
select is((public.game_state(tests.gid()) ->> 'board_unlocked')::boolean, true, 'game_state: board unlocked after draw');
select is((public.game_state(tests.gid()) -> 'game' ->> 'status'), 'in_progress', 'game_state game.status');
select tests.logout();
select tests.tap(tests.gid(), tests.target(tests.gid()));

select tests.play_found(tests.gid()) from generate_series(1, 8);
select is(tests.seats(tests.gid()), array[1,2,3,1,2,3,1,2,3], 'strict round-robin order over 3 rounds');
select is((select status::text from public.games where id = tests.gid()), 'finished', 'game finishes after all rounds');
select is((select finished_at is not null and current_turn_id is null from public.games where id = tests.gid()), true, 'finished_at set, no current turn');
select is((select array_agg(turns_done) from public.game_players where game_id = tests.gid()), array[3,3,3], 'everyone played 3 turns');
select is((select count(distinct target_picture_id)::int from public.turns where game_id = tests.gid()), 9, 'no target repeats within a game');
select is((select count(*)::int from public.turns where game_id = tests.gid() and status = 'found'), 9, 'all nine turns found');
select is((select count(*)::int from public.notification_outbox where kind = 'game_finished' and game_id = tests.gid()), 3,
          'game_finished queued for each player');
select is((select count(*)::int from public.notification_outbox where kind = 'your_turn' and game_id = tests.gid()), 9, 'one your_turn per turn');
select tests.login(1);
select throws_ok(format('select public.draw_target(%L)', tests.gid()), 'SN005', 'game_not_in_progress', 'cannot draw after finish');
select is((public.game_state(tests.gid()) -> 'players' -> 0 ->> 'rank'), '1', 'finished game has a rank 1');
select tests.logout();

-- ============================================= retired player skipped in order
select tests.put('gid', tests.new_game(3, 3, 100)::text);
select tests.play_found(tests.gid());                                   -- seat 1
select is(tests.cur(tests.gid()), tests.seat_user(tests.gid(), 2), 'seat 2 is next');
select tests.retire(tests.gid(), tests.seat_user(tests.gid(), 2));      -- retires with pending turn
select is((select status::text from public.turns where game_id = tests.gid() and seq = 2), 'forfeited', 'retiring closes open turn forfeited');
select is((select score_ms from public.turns where game_id = tests.gid() and seq = 2), null, 'retire forfeit carries no score');
select is((select turns_done from public.game_players where game_id = tests.gid() and seat = 2), 0, 'retired player totals untouched');
select is(tests.cur(tests.gid()), tests.seat_user(tests.gid(), 3), 'turn passes to seat 3');
select tests.play_found(tests.gid()) from generate_series(1, 5);
select is(tests.seats(tests.gid()), array[1,2,3,1,3,1,3], 'order correct with retired player');
select is((select status::text from public.games where id = tests.gid()), 'finished', 'game finishes with a retired player');
select is((select count(*)::int from public.turns where game_id = tests.gid() and user_id = tests.u(tests.seat_user(tests.gid(), 2))), 1,
          'retired player got no further turns');
select tests.login(tests.seat_user(tests.gid(), 2));
select is((public.game_state(tests.gid()) -> 'players' -> 2 ->> 'status'), 'retired', 'retired listed last');
select is((public.game_state(tests.gid()) -> 'players' -> 2 -> 'rank'), 'null'::jsonb, 'retired player has no rank');
select tests.logout();

-- ========================================== one active player remains -> finished
select tests.put('gid', tests.new_game(3, 5, 100)::text);
select tests.retire(tests.gid(), tests.seat_user(tests.gid(), 3));      -- not their turn
select is((select status::text from public.games where id = tests.gid()), 'in_progress', 'two active players: game continues');
select tests.retire(tests.gid(), tests.seat_user(tests.gid(), 2));      -- not their turn either
select is((select status::text from public.games where id = tests.gid()), 'finished', 'game finishes when one active player remains');
select is((select count(*)::int from public.turns where game_id = tests.gid() and status in ('pending','live')), 0, 'no open turn left');
select is((select count(*)::int from public.notification_outbox where kind = 'game_finished' and game_id = tests.gid()), 3, 'all players notified');
select tests.login(tests.seat_user(tests.gid(), 1));
select is((public.game_state(tests.gid()) -> 'me' ->> 'rank'), '1', 'sole remaining player ranks first');
select tests.logout();

-- two-player game: the other player retires mid-turn
select tests.put('gid', tests.new_game(2, 3, 100)::text);
select tests.draw(tests.gid());
select tests.retire(tests.gid(), tests.cur(tests.gid()));              -- current, live turn
select is((select status::text from public.games where id = tests.gid()), 'finished', '2-player game ends when one retires');
select is((select count(*)::int from public.turns where game_id = tests.gid() and status = 'forfeited'), 1, 'live turn forfeited');

-- retire is idempotent / rejected where it should be
select tests.login(1);
select throws_ok(format('select public.retire(%L)', tests.gid()), 'SN005', 'game_not_in_progress', 'cannot retire from a finished game');
select tests.logout();

-- =============================================================== ranking
select tests.put('gid', tests.new_game(4, 3, 100)::text);
select tests.retire(tests.gid(), 4);
update public.game_players set total_ms = 500,  wrong_taps = 0 where game_id = tests.gid() and user_id = tests.u(4);
update public.game_players set total_ms = 1000, wrong_taps = 0 where game_id = tests.gid() and user_id = tests.u(1);
update public.game_players set total_ms = 1000, wrong_taps = 0 where game_id = tests.gid() and user_id = tests.u(2);
update public.game_players set total_ms = 1000, wrong_taps = 2 where game_id = tests.gid() and user_id = tests.u(3);
select tests.login(1);
select is((select jsonb_agg(p -> 'rank') from jsonb_array_elements(public.game_state(tests.gid()) -> 'players') p),
          '[1,1,3,null]'::jsonb, 'ties share a rank, wrong taps break ties, retired last without rank');
select is((select jsonb_agg(p ->> 'status') from jsonb_array_elements(public.game_state(tests.gid()) -> 'players') p),
          '["active","active","active","retired"]'::jsonb, 'retired listed after ranking');
select is((select p ->> 'turns_done' from jsonb_array_elements(public.game_state(tests.gid()) -> 'players') p
            where p ->> 'user_id' = tests.u(4)::text), '0', 'retired player still shown with completed rounds');
select tests.logout();

select * from finish();
rollback;
