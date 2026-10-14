begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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
select tests.u(i), 'layout' || i || '@example.com', 'authenticated', 'authenticated', '{}'::jsonb
from generate_series(1, 2) i;

-- ================================================================== schema
select col_not_null('public', 'games', 'layout', 'games.layout is not null');
select col_default_is('public', 'games', 'layout', 'grid', 'games.layout defaults to grid');
select hasnt_function('public', 'create_game', array['integer', 'integer', 'boolean'],
                      'the three-argument create_game is replaced, not overloaded');

-- ============================================================= create_game
set local role anon;
select throws_ok($$select public.create_game(5, 200, false, 'scatter')$$, '42501', null, 'anon cannot create a game');
reset role;

select tests.login(1);
select tests.put('plain', public.create_game(rounds => 5, board_size => 200)::text);
select tests.put('scatter', public.create_game(rounds => 5, board_size => 200, layout => 'scatter')::text);
select tests.put('both', public.create_game(5, 300, true, 'scatter')::text);
select tests.put('null', public.create_game(rounds => 5, board_size => 200, layout => null)::text);
select throws_ok($$select public.create_game(rounds => 5, board_size => 200, layout => 'spiral')$$,
                 'SN010', 'invalid_argument', 'unknown layout rejected');
select tests.logout();
select is((select layout from public.games where id = tests.gid('plain')), 'grid', 'grid by default');
select throws_ok($$update public.games set layout = 'spiral' where id = tests.gid('plain')$$, '23514', null,
                 'only grid and scatter are allowed');
select is((select layout from public.games where id = tests.gid('scatter')), 'scatter', 'scatter is saved on the game');
select is((select row(monochrome, layout)::text from public.games where id = tests.gid('both')), row(true, 'scatter')::text,
          'monochrome and scatter together');
select is((select layout from public.games where id = tests.gid('null')), 'grid', 'null counts as grid');

-- ============================================================== game_state
select tests.login(1);
select is(public.game_state(tests.gid('scatter')) -> 'game' ->> 'layout', 'scatter', 'game_state reports scatter');
select is(public.game_state(tests.gid('plain')) -> 'game' ->> 'layout', 'grid', 'game_state reports grid');
select tests.logout();

-- ================================================================= rematch
update public.games set status = 'finished', finished_at = now() where id = tests.gid('scatter');
select tests.login(1);
select tests.put('rematch', public.rematch(tests.gid('scatter'))::text);
select tests.logout();
select is((select layout from public.games where id = tests.gid('rematch')), 'scatter', 'rematch keeps the layout');

select * from finish();
rollback;
