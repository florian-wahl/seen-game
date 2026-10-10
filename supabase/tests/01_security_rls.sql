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

select tests.put('gid', tests.new_game(3, 3, 100)::text);
select tests.mkusers(4);   -- user 4 is a non-member outsider

-- ---------------------------------------------------------------- RLS on
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0,
          'every public table has RLS enabled');

-- --------------------------------------------------------------- profiles
select is((select count(*)::int from public.profiles
            where id in (tests.u(1), tests.u(2), tests.u(3), tests.u(4))), 4,
          'profile auto-created per auth user');
select is((select display_name from public.profiles where id = tests.u(1)), 'user1',
          'display_name defaults to email local part');
insert into auth.users (id, email, aud, role, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'g@example.com', 'authenticated', 'authenticated',
        '{"full_name":"Grace Hopper"}');
select is((select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
          'Grace Hopper', 'display_name uses OAuth full_name');

-- ------------------------------------------- no direct writes for clients
select tests.login(1);
select ok(tests.denied(format('insert into public.%I default values', t)), 'authenticated cannot insert into ' || t)
  from unnest(array['profiles','pictures','picture_confusables','games','game_players','invites',
                    'board_tiles','turns','taps','push_subscriptions','notification_outbox']) t;
select ok(tests.denied(format('delete from public.%I', t)), 'authenticated cannot delete from ' || t)
  from unnest(array['profiles','pictures','picture_confusables','games','game_players','invites',
                    'board_tiles','turns','taps','push_subscriptions','notification_outbox']) t;
select ok(tests.denied(format('update public.%I set %I = %I', t,
            (select attname from pg_attribute where attrelid = ('public.' || t)::regclass and attnum = 2),
            (select attname from pg_attribute where attrelid = ('public.' || t)::regclass and attnum = 2))),
          'authenticated cannot update ' || t)
  from unnest(array['profiles','pictures','picture_confusables','games','game_players','invites',
                    'board_tiles','turns','taps','push_subscriptions','notification_outbox']) t;
select ok(tests.denied('insert into public.turns_public default values'), 'cannot write through the view');
select tests.logout();

set local role anon;
select ok(tests.denied(format('insert into public.%I default values', t)), 'anon cannot insert into ' || t)
  from unnest(array['profiles','games','game_players','invites','board_tiles','turns','taps']) t;
select ok(tests.denied(format('update public.%I set %I = %I', t,
            (select attname from pg_attribute where attrelid = ('public.' || t)::regclass and attnum = 2),
            (select attname from pg_attribute where attrelid = ('public.' || t)::regclass and attnum = 2))),
          'anon cannot update ' || t)
  from unnest(array['profiles','games','game_players','invites','board_tiles','turns','taps']) t;
select ok(tests.denied('select * from public.games'), 'anon cannot read games');
select ok(tests.denied('select * from public.turns_public'), 'anon cannot read turns_public');
select ok(tests.denied('select public.create_game(3,100)'), 'anon cannot call create_game');
select tests.logout();

-- ------------------------------------------------- function execute rights
select tests.login(1);
select ok(tests.denied(format('select public.start_game_internal(%L, ''[]''::jsonb)', tests.gid())),
          'authenticated cannot call start_game_internal');
select ok(tests.denied('select public.sweep_turns()'), 'authenticated cannot call sweep_turns');
select ok(tests.denied('select private.advance(null)'), 'authenticated cannot call private.advance');
select tests.logout();

-- --------------------------------------------------------- read isolation
select tests.login(4);
select is((select count(*)::int from public.games), 0, 'outsider sees no games');
select is((select count(*)::int from public.game_players), 0, 'outsider sees no game_players');
select is((select count(*)::int from public.turns_public), 0, 'outsider sees no turns');
select is((select count(*)::int from public.invites), 0, 'outsider sees no invites');
select is((select count(*)::int from public.profiles
            where id in (tests.u(1), tests.u(2), tests.u(3), tests.u(4),
                         '11111111-1111-1111-1111-111111111111')), 5,
          'any signed-in user reads profiles');
select tests.logout();

select tests.login(2);
select is((select count(*)::int from public.games), 1, 'member sees the game');
select is((select count(*)::int from public.game_players), 3, 'member sees all players');
select is((select count(*)::int from public.invites), 0, 'non-host member cannot read invite');
select tests.logout();
select tests.login(1);
select is((select count(*)::int from public.invites), 1, 'host reads invite');
select tests.logout();

select tests.login(1);
select ok(tests.denied('select * from public.picture_confusables'), 'picture_confusables not readable');
select ok(tests.denied('select * from public.notification_outbox'), 'notification_outbox not readable');
select ok(tests.denied('select * from public.turns'), 'turns base table not readable');
select tests.logout();

-- ----------------------------------------------- turns_public masks target
update public.turns set target_picture_id = 'p0001' where game_id = tests.gid() and status = 'pending';
select tests.login(2);
select is((select target_picture_id from public.turns_public where status = 'pending'), null,
          'turns_public hides target_picture_id while undrawn');
select tests.logout();
update public.turns set target_picture_id = null where game_id = tests.gid() and status = 'pending';

-- ------------------------------------------- tiles locked until own draw
select tests.login(tests.cur(tests.gid()));
select is((select count(*)::int from public.board_tiles), 0, 'tiles invisible before own first draw');
select tests.logout();

select tests.draw(tests.gid());

select tests.login(tests.cur(tests.gid()));
select is((select count(*)::int from public.board_tiles), 100, 'tiles visible after own first draw');
select isnt((select target_picture_id from public.turns_public where status = 'live'), null, 'target exposed once drawn');
select tests.logout();

-- another member who has not drawn yet still sees no tiles
select tests.login((select n from (select n from generate_series(1,3) n where n <> tests.cur(tests.gid()) limit 1) s));
select is((select count(*)::int from public.board_tiles), 0, 'other member still sees no tiles');
select tests.logout();

-- ------------------------------------------------------ taps privacy
select tests.tap(tests.gid(), tests.wrong_pic(tests.gid()), 1);
select tests.login(tests.cur(tests.gid()));
select is((select count(*)::int from public.taps), 1, 'player reads own tap');
select tests.logout();
select tests.login((select n from (select n from generate_series(1,3) n where n <> tests.cur(tests.gid()) limit 1) s));
select is((select count(*)::int from public.taps), 0, 'other members cannot read my taps');
select tests.logout();

-- ------------------------------------------------------ outbox rows exist
select is((select count(*)::int from public.notification_outbox where kind = 'your_turn'), 1,
          'your_turn queued at start');

-- ---------------------------------------------------------------- storage
select is((select public from storage.buckets where id = 'pictures'), true, 'pictures bucket is public');
select is((select public from storage.buckets where id = 'avatars'), false, 'avatars bucket is private');
select tests.login(1);
select lives_ok(format($q$insert into storage.objects (bucket_id, name, owner) values ('avatars', %L, %L)$q$,
          tests.u(1)::text || '/a.png', tests.u(1)), 'user may write own avatar folder');
select throws_ok(format($q$insert into storage.objects (bucket_id, name, owner) values ('avatars', %L, %L)$q$,
          tests.u(2)::text || '/a.png', tests.u(1)), '42501', null, 'user may not write another avatar folder');
select throws_ok($q$insert into storage.objects (bucket_id, name) values ('pictures', 'x.svg')$q$,
          '42501', null, 'clients cannot write pictures bucket');
select tests.logout();

select * from finish();
rollback;
