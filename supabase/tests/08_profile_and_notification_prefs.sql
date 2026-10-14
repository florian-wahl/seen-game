begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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
select tests.u(i), 'prefs' || i || '@example.com', 'authenticated', 'authenticated', '{}'::jsonb
from generate_series(1, 2) i;

-- ================================================================= display name
select tests.login(1);
select is(public.update_profile(display_name => '  Ada  ') ->> 'display_name', 'Ada', 'name is trimmed');
select throws_ok($$select public.update_profile(display_name => repeat('x', 61))$$, 'SN010', 'invalid_argument',
                 'name over 60 characters rejected');
select is(public.update_profile(display_name => '   ') ->> 'display_name', 'Ada', 'blank name leaves the old one');
select tests.logout();
select tests.login(2);
select is((select display_name from public.profiles where id = tests.u(1)), 'Ada', 'other players see the new name');
select tests.logout();

-- ============================================================ notification prefs
set local role anon;
select throws_ok($$select public.set_notification_prefs(email => false)$$, '42501', null,
                 'anon cannot execute set_notification_prefs');
reset role;

select tests.login(1);
select is((select count(*)::int from public.notification_prefs), 0, 'no row until a player changes something');
select is(public.set_notification_prefs(email => false), '{"email": false, "push": true}'::jsonb,
          'turning email off keeps push on');
select is(public.set_notification_prefs(push => false), '{"email": false, "push": false}'::jsonb,
          'null argument leaves the other channel unchanged');
select is(public.set_notification_prefs(email => true), '{"email": true, "push": false}'::jsonb, 'email back on');
select is((select count(*)::int from public.notification_prefs), 1, 'one row per player (upsert)');
select is((select row(email, push)::text from public.notification_prefs where user_id = tests.u(1)), row(true, false)::text,
          'owner can read own prefs');
select throws_ok($$update public.notification_prefs set email = false$$, '42501', null, 'direct update is not allowed');
select throws_ok($$insert into public.notification_prefs (user_id) values (tests.u(1))$$, '42501', null,
                 'direct insert is not allowed');
select tests.logout();

select tests.login(2);
select is((select count(*)::int from public.notification_prefs), 0, 'another player cannot read someone else''s prefs');
select is(public.set_notification_prefs(), '{"email": true, "push": true}'::jsonb, 'defaults are both on');
select tests.logout();
select is((select row(email, push)::text from public.notification_prefs where user_id = tests.u(1)), row(true, false)::text,
          'player 1 prefs untouched by player 2');

-- deleting the account removes the prefs
delete from auth.users where id = tests.u(1);
select is((select count(*)::int from public.notification_prefs where user_id = tests.u(1)), 0, 'prefs cascade on account delete');

select * from finish();
rollback;
