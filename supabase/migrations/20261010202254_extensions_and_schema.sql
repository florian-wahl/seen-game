-- Extensions, private schema, enums.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Internal helpers live here. The schema is NOT in the PostgREST exposed list
-- (config.toml [api] schemas), so nothing in it is callable through the API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Nothing created later in `public` should be implicitly reachable by clients.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

create type public.review_status as enum ('draft', 'approved', 'rejected');
create type public.game_status    as enum ('lobby', 'in_progress', 'finished', 'abandoned');
create type public.player_status  as enum ('active', 'retired');
create type public.turn_status    as enum ('pending', 'live', 'found', 'capped', 'forfeited');
create type public.outbox_kind    as enum ('your_turn', 'reminder', 'game_finished');
