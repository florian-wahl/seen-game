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
  return r;
end $$;

-- messages visible on a topic as the current role (the Realtime server sets realtime.topic when authorizing a join)
create function tests.msgs(t text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('realtime.topic', t, true);
  select count(*)::int into n from realtime.messages m where m.topic = t;
  return n;
end $$;

select plan(14);

create table tests.g as select tests.new_game(3, 3, 100) as id;
grant select on tests.g to public;
select tests.mkusers(4);  -- user 4 is not a member

select ok((select count(*) from realtime.messages
           where topic = 'game:' || (select id from tests.g) and event = 'changed' and private) > 0,
          'setup produced private "changed" broadcasts for the game');
select ok((select bool_and(payload ->> 'game_id' = (select id::text from tests.g)) from realtime.messages
           where topic = 'game:' || (select id from tests.g)), 'payload carries the game id');
select set_eq($$select distinct payload ->> 'table' from realtime.messages where topic = 'game:' || (select id::text from tests.g)$$,
              $$values ('games'), ('game_players'), ('turns')$$, 'all three tables broadcast');
select is((select count(*)::int from realtime.messages m, jsonb_object_keys(m.payload) k
           where topic = 'game:' || (select id from tests.g) and k not in ('game_id', 'table', 'id')), 0,
          'payload has only game_id/table (+ generated id): no game data');

-- one statement touching several rows of one game = one message
delete from realtime.messages;
update public.game_players set joined_at = joined_at where game_id = (select id from tests.g);
select is((select count(*)::int from realtime.messages where payload ->> 'table' = 'game_players'), 1,
          'multi-row statement sends a single message');

delete from realtime.messages;
update public.games set status = status where id = (select id from tests.g);
select is((select count(*)::int from realtime.messages where payload ->> 'table' = 'games'), 1, 'games update broadcasts');
delete from realtime.messages;
update public.turns set status = status where game_id = (select id from tests.g);
select ok((select count(*) from realtime.messages where payload ->> 'table' = 'turns') >= 1, 'turns update broadcasts');

-- a real RPC flow produces a message, with no target info
delete from realtime.messages;
select tests.draw((select id from tests.g));
select ok((select count(*) from realtime.messages where topic = 'game:' || (select id from tests.g) and event = 'changed') >= 1,
          'draw_target broadcasts');
select is((select count(*)::int from realtime.messages where payload::text ilike '%picture%' or payload::text ilike '%target%'), 0,
          'no picture/target info in payloads');

-- RLS on realtime.messages
select tests.login(2);
select ok(tests.msgs('game:' || (select id from tests.g)) >= 1, 'member can select the game topic');
select tests.logout();

select tests.login(4);
select is(tests.msgs('game:' || (select id from tests.g)), 0, 'non-member cannot select the game topic');
select is(tests.msgs('game:not-a-uuid'), 0, 'malformed topic is simply invisible');
select throws_ok($$insert into realtime.messages (topic, extension, event, private, payload)
                   values ('game:x', 'broadcast', 'changed', true, '{}')$$, '42501', null,
                 'clients cannot insert into realtime.messages');
select tests.logout();

select tests.login(2);
select throws_ok($$insert into realtime.messages (topic, extension, event, private, payload)
                   values ('game:x', 'broadcast', 'changed', true, '{}')$$, '42501', null,
                 'even members cannot send');
select tests.logout();

select * from finish();
rollback;
