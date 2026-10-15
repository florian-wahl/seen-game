begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

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

insert into auth.users (id, email, aud, role, raw_user_meta_data)
select tests.u(i), 'best' || i || '@example.com', 'authenticated', 'authenticated', '{}'::jsonb
from generate_series(1, 3) i;

-- One game per call: host = player 1, status, settings, then each player's (user, status, total_ms).
create function tests.game(k int, st public.game_status, rounds int, size int,
                           mono boolean default false, lay text default 'grid') returns uuid language sql as $$
  insert into public.games (id, host_id, status, rounds_per_player, board_size, monochrome, layout)
  values (('10000000-0000-0000-0000-' || lpad(k::text, 12, '0'))::uuid, tests.u(1), st, rounds, size, mono, lay)
  returning id
$$;
create function tests.g(k int) returns uuid language sql immutable as
$$ select ('10000000-0000-0000-0000-' || lpad(k::text, 12, '0'))::uuid $$;
create function tests.player(k int, n int, st public.player_status, total bigint) returns void language sql as $$
  insert into public.game_players (game_id, user_id, status, total_ms, turns_done) values (tests.g(k), tests.u(n), st, total, 5)
$$;
create function tests.turn(k int, n int, seq int, st public.turn_status) returns void language sql as $$
  insert into public.turns (game_id, user_id, seq, round, status) values (tests.g(k), tests.u(n), seq, 1, st)
$$;

select tests.game(1, 'finished', 5, 200);                    -- counts
select tests.player(1, 1, 'active', 50000);
select tests.player(1, 2, 'active', 1000);                  -- player 2's time is not player 1's
select tests.turn(1, 1, 1, 'found');
select tests.turn(1, 1, 2, 'capped');                       -- a capped turn still counts
select tests.turn(1, 2, 3, 'forfeited');                    -- someone else's forfeit does not exclude it
select tests.game(2, 'finished', 5, 200);                    -- counts: best for 5 × 200
select tests.player(2, 1, 'active', 40000);
select tests.game(3, 'finished', 5, 200);                    -- own forfeited turn: excluded
select tests.player(3, 1, 'active', 30000);
select tests.turn(3, 1, 1, 'forfeited');
select tests.game(4, 'finished', 5, 200);                    -- retired: excluded
select tests.player(4, 1, 'retired', 20000);
select tests.game(5, 'in_progress', 5, 200);                 -- not finished: excluded
select tests.player(5, 1, 'active', 10000);
select tests.game(6, 'finished', 3, 100);                    -- old settings: excluded
select tests.player(6, 1, 'active', 5000);
select tests.game(7, 'finished', 10, 300, true, 'scatter');  -- monochrome + scattered: same type as plain
select tests.player(7, 1, 'active', 95000);
select tests.game(8, 'finished', 10, 300);
select tests.player(8, 1, 'active', 99000);
select tests.game(9, 'finished', 20, 500);                   -- player 2 only
select tests.player(9, 2, 'active', 400000);

set local role anon;
select throws_ok($$select public.my_best_times()$$, '42501', null, 'anon cannot call my_best_times');
reset role;

select tests.login(1);
select is(public.my_best_times(),
          '[{"rounds": 5, "board_size": 200, "best_ms": 40000, "games": 2},
            {"rounds": 10, "board_size": 300, "best_ms": 95000, "games": 2}]'::jsonb,
          'lowest total per type; forfeits, retirements, unfinished and old settings left out');
select tests.logout();

select tests.login(2);
select is(public.my_best_times(),
          '[{"rounds": 20, "board_size": 500, "best_ms": 400000, "games": 1}]'::jsonb,
          'own forfeited turn excludes the game for that player only');
select tests.logout();

select tests.login(3);
select is(public.my_best_times(), '[]'::jsonb, 'no finished game: empty list');
select tests.logout();

-- A forfeited turn of player 1 in game 2 removes it: 5 × 200 falls back to game 1.
select tests.turn(2, 1, 1, 'forfeited');
select tests.login(1);
select is(public.my_best_times() -> 0, '{"rounds": 5, "board_size": 200, "best_ms": 50000, "games": 1}'::jsonb,
          'a forfeit in the best game drops it');
select tests.logout();

select throws_ok($$select public.my_best_times()$$, 'SN001', null, 'signed-out caller rejected');

select * from finish();
rollback;
