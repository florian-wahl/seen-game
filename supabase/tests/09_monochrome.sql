begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create schema tests;
grant usage on schema tests to public;
create function tests.u(n int) returns uuid language sql immutable as
$$ select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
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
create table tests.vals (k text primary key, v text);
grant all on tests.vals to public;
create function tests.put(k text, v text) returns void language sql as
$$ insert into tests.vals values (k, v) on conflict (k) do update set v = excluded.v $$;
create function tests.gid(k text) returns uuid language sql as
$$ select (v::jsonb ->> 'game_id')::uuid from tests.vals where vals.k = gid.k $$;

insert into auth.users (id, email, aud, role, raw_user_meta_data)
select tests.u(i), 'mono' || i || '@example.com', 'authenticated', 'authenticated', '{}'::jsonb
from generate_series(1, 2) i;

-- ================================================================== schema
select col_not_null('public', 'games', 'monochrome', 'games.monochrome is not null');
select col_default_is('public', 'games', 'monochrome', 'false', 'games.monochrome defaults to off');
select hasnt_function('public', 'create_game', array['integer', 'integer'],
                      'the two-argument create_game is replaced, not overloaded');

-- ============================================================= create_game
set local role anon;
select throws_ok($$select public.create_game(5, 200, true)$$, '42501', null, 'anon cannot create a game');
reset role;

select tests.login(1);
select tests.put('plain', public.create_game(rounds => 5, board_size => 200)::text);
select tests.put('mono', public.create_game(rounds => 5, board_size => 200, monochrome => true)::text);
select tests.put('null', public.create_game(rounds => 5, board_size => 200, monochrome => null)::text);
select tests.logout();
select is((select monochrome from public.games where id = tests.gid('plain')), false, 'monochrome is off by default');
select is((select monochrome from public.games where id = tests.gid('mono')), true, 'monochrome is saved on the game');
select is((select monochrome from public.games where id = tests.gid('null')), false, 'null counts as off');

-- ============================================================== game_state
select tests.login(1);
select is((public.game_state(tests.gid('mono')) -> 'game' ->> 'monochrome')::boolean, true, 'game_state reports monochrome');
select is((public.game_state(tests.gid('plain')) -> 'game' ->> 'monochrome')::boolean, false, 'game_state reports color games too');
select tests.logout();

-- ================================================================= rematch
update public.games set status = 'finished', finished_at = now() where id = tests.gid('mono');
select tests.login(1);
select tests.put('rematch', public.rematch(tests.gid('mono'))::text);
select tests.logout();
select is((select monochrome from public.games where id = tests.gid('rematch')), true, 'rematch keeps monochrome');

select * from finish();
rollback;
