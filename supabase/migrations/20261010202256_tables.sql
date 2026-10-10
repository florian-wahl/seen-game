-- Tables, constraints, indexes (DESIGN.md section 4).

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table public.pictures (
  id              text primary key,
  name            text not null,
  category        text not null,
  file_path       text not null,
  review_status   public.review_status not null default 'draft',
  library_version int not null default 1
);

create table public.picture_confusables (
  picture_a text not null references public.pictures (id) on delete cascade,
  picture_b text not null references public.pictures (id) on delete cascade,
  primary key (picture_a, picture_b),
  check (picture_a < picture_b)
);

create table public.games (
  id                uuid primary key default gen_random_uuid(),
  host_id           uuid not null references public.profiles (id),
  status            public.game_status not null default 'lobby',
  rounds_per_player int not null check (rounds_per_player in (3, 5, 10)),
  board_size        int not null check (board_size in (100, 200, 300)),
  penalty_ms        int not null default 5000 check (penalty_ms >= 0),
  cap_ms            int not null default 90000 check (cap_ms > 0),
  current_turn_id   uuid,
  created_at        timestamptz not null default now(),
  -- bumped on lobby joins/leaves; a lobby idle for 7 days is abandoned
  last_activity_at  timestamptz not null default now(),
  started_at        timestamptz,
  finished_at       timestamptz
);
create index games_host_idx on public.games (host_id);

create table public.game_players (
  game_id           uuid not null references public.games (id) on delete cascade,
  user_id           uuid not null references public.profiles (id),
  seat              int check (seat between 1 and 6),
  status            public.player_status not null default 'active',
  turns_done        int not null default 0,
  total_ms          bigint not null default 0,
  wrong_taps        int not null default 0,
  board_unlocked_at timestamptz,
  joined_at         timestamptz not null default now(),
  primary key (game_id, user_id),
  unique (game_id, seat)
);
create index game_players_user_idx on public.game_players (user_id);

create table public.invites (
  token      text primary key check (char_length(token) = 22),
  game_id    uuid not null unique references public.games (id) on delete cascade,
  expires_at timestamptz not null
);

create table public.board_tiles (
  game_id    uuid not null references public.games (id) on delete cascade,
  picture_id text not null references public.pictures (id),
  x          double precision not null,
  y          double precision not null,
  rotation   double precision not null,
  scale      double precision not null,
  primary key (game_id, picture_id)
);

create table public.turns (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references public.games (id) on delete cascade,
  user_id           uuid not null references public.profiles (id),
  seq               int not null,
  round             int not null,
  status            public.turn_status not null default 'pending',
  became_current_at timestamptz not null default clock_timestamp(),
  drawn_at          timestamptz,
  deadline_at       timestamptz,
  ended_at          timestamptz,
  target_picture_id text references public.pictures (id),
  wrong_taps        int not null default 0,
  score_ms          int,
  reminded_at       timestamptz,
  unique (game_id, seq),
  unique (game_id, target_picture_id)
);
-- at most one open turn per game
create unique index turns_one_open_per_game on public.turns (game_id) where status in ('pending', 'live');
create index turns_user_idx on public.turns (user_id);

alter table public.games
  add constraint games_current_turn_fk foreign key (current_turn_id) references public.turns (id) on delete set null;

create table public.taps (
  turn_id           uuid not null references public.turns (id) on delete cascade,
  client_seq        int not null,
  picture_id        text not null,
  server_at         timestamptz not null,
  correct           boolean not null,
  -- false when the tap arrived at/after the deadline (or after the turn closed)
  counted           boolean not null default true,
  client_elapsed_ms int,
  primary key (turn_id, client_seq)
);

create table public.push_subscriptions (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh   text not null,
  auth     text not null,
  unique (user_id, endpoint)
);

create table public.notification_outbox (
  id              bigint generated always as identity primary key,
  kind            public.outbox_kind not null,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  game_id         uuid not null references public.games (id) on delete cascade,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  attempts        int not null default 0,
  last_attempt_at timestamptz
);
create index notification_outbox_unsent_idx on public.notification_outbox (created_at) where sent_at is null;
