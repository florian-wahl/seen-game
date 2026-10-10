begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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
select tests.u(i), 'push' || i || '@example.com', 'authenticated', 'authenticated', '{}'::jsonb
from generate_series(1, 2) i;

-- anonymous callers cannot use the RPCs
set local role anon;
select throws_ok($$select public.save_push_subscription('https://push.example/a', 'k', 'a')$$, '42501', null,
                 'anon cannot execute save_push_subscription');
reset role;

select tests.login(1);
select lives_ok($$select public.save_push_subscription('https://push.example/a', 'key1', 'auth1')$$, 'user 1 saves a subscription');
select lives_ok($$select public.save_push_subscription('https://push.example/a', 'key2', 'auth2')$$, 'saving again is an upsert');
select is((select count(*)::int from public.push_subscriptions), 1, 'one row after upsert');
select is((select p256dh from public.push_subscriptions), 'key2', 'keys updated on upsert');
select throws_ok($$select public.save_push_subscription('http://insecure.example/a', 'k', 'a')$$, 'SN010', 'invalid_argument',
                 'non-https endpoint rejected');
select throws_ok($$select public.save_push_subscription('https://push.example/b', '', 'a')$$, 'SN010', 'invalid_argument',
                 'empty key rejected');
select tests.logout();

-- user 2 cannot see or delete user 1's subscription
select tests.login(2);
select is((select count(*)::int from public.push_subscriptions), 0, 'user 2 cannot see user 1 subscriptions');
select lives_ok($$select public.delete_push_subscription('https://push.example/a')$$, 'delete of someone else''s endpoint is a no-op');
select tests.logout();
select is((select count(*)::int from public.push_subscriptions), 1, 'user 1 row survived');

select tests.login(1);
select public.delete_push_subscription('https://push.example/a');
select tests.logout();
select is((select count(*)::int from public.push_subscriptions), 0, 'owner deletes own subscription');

select tests.login(1);
select throws_ok($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                    values (tests.u(1), 'https://x', 'k', 'a')$$, '42501', null, 'direct insert is not allowed');
select tests.logout();

select * from finish();
rollback;
