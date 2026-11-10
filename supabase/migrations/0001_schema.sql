-- 0001: схема. Соответствует docs/01-architecture.md и docs/DECISIONS.md.

create extension if not exists pgcrypto;

-- ---------- перечисления ----------

do $$ begin
  create type user_role as enum ('admin','player','spectator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dice_tier as enum ('wood','bronze','silver','gold');
exception when duplicate_object then null; end $$;

do $$ begin
  create type question_kind as enum ('choice','yes_no','exact_score');
exception when duplicate_object then null; end $$;

-- ---------- профили и сезоны ----------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 24),
  avatar_url text,
  role user_role not null default 'player',
  created_at timestamptz not null default now()
);

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  status text not null default 'draft' check (status in ('draft','active','finished')),
  starts_on date not null,
  ends_on date not null,
  board_seed integer not null,
  art_variant text not null default 'late-autumn-winter',
  results jsonb,
  created_at timestamptz not null default now()
);

create table if not exists season_players (
  season_id uuid references seasons(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  position integer not null default 1 check (position between 1 and 80),
  finished_at timestamptz,
  joined_at timestamptz not null default now(),
  is_active boolean not null default true,
  primary key (season_id, profile_id)
);

-- ---------- карта ----------

create table if not exists cells (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  idx integer not null check (idx between 1 and 80),
  kind text not null check (kind in ('start','plain','event','finish')),
  mechanic_code text,
  config jsonb not null default '{}',
  x numeric not null default 0,
  y numeric not null default 0,
  zone text not null default 'winter' check (zone in ('autumn','winter')),
  unique (season_id, idx)
);

-- ---------- матчи ----------

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  league_code text not null,
  league_title text not null,
  home_name text not null,
  home_logo text,
  away_name text not null,
  away_logo text,
  kickoff_utc timestamptz not null,
  status text not null default 'NS'
    check (status in ('NS','LIVE','HT','FT','PST','CANC','ABD')),
  minute integer,
  home_score integer,
  away_score integer,
  ht_home_score integer,
  ht_away_score integer,
  raw jsonb,
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index if not exists matches_kickoff_idx on matches (kickoff_utc);
create index if not exists matches_status_idx on matches (status);

create table if not exists matchdays (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  game_date date not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','locked','live','resolving','closed')),
  q_total integer,
  resolved_at timestamptz,
  unique (season_id, game_date)
);

create table if not exists matchday_matches (
  matchday_id uuid references matchdays(id) on delete cascade,
  match_id uuid references matches(id) on delete cascade,
  in_scope boolean not null default true,
  primary key (matchday_id, match_id)
);

-- ---------- вопросы и ответы ----------

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references matchdays(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  kind question_kind not null,
  template text not null default 'winner',
  prompt text not null,
  options jsonb not null,
  rule jsonb not null default '{}'::jsonb,
  correct_option text,
  locks_at timestamptz not null,
  is_bonus boolean not null default false,
  status text not null default 'open' check (status in ('open','locked','resolved','void')),
  source text not null default 'auto' check (source in ('auto','manual')),
  created_at timestamptz not null default now()
);

create index if not exists questions_matchday_idx on questions (matchday_id);

create table if not exists answers (
  question_id uuid references questions(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  choice text not null,
  is_correct boolean,
  submitted_at timestamptz not null default now(),
  primary key (question_id, profile_id)
);

-- ---------- кубики, броски, события ----------

create table if not exists dice (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  tier dice_tier not null,
  sides integer not null check (sides in (2,3,4,6)),
  source text not null check (source in ('matchday','exact_score','catchup','event','admin')),
  matchday_id uuid references matchdays(id),
  granted_at timestamptz not null default now(),
  consumed_at timestamptz
);

create unique index if not exists dice_one_grant_per_source
  on dice (matchday_id, profile_id, source)
  where matchday_id is not null;

create index if not exists dice_profile_idx on dice (profile_id, season_id);

create table if not exists catchup_grants (
  season_id uuid references seasons(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (season_id, profile_id, granted_at)
);

create table if not exists rolls (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  profile_id uuid not null references profiles(id),
  dice_id uuid not null unique references dice(id),
  base_value integer not null,
  value integer,
  from_position integer not null,
  to_position integer,
  state text not null default 'pending_move' check (state in ('pending_move','moved')),
  modifiers jsonb not null default '{}'::jsonb,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

create table if not exists cell_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  profile_id uuid not null references profiles(id),
  roll_id uuid references rolls(id),
  cell_idx integer not null,
  mechanic_code text,
  rule_version integer not null default 1,
  state text not null default 'pending'
    check (state in ('pending','awaiting_choice','awaiting_other','resolved','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  outcome jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists cell_events_season_idx on cell_events (season_id, created_at desc);

create table if not exists active_effects (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  code text not null,
  charges integer not null default 1,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists active_effects_profile_idx on active_effects (profile_id, season_id);

create table if not exists pending_actions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  event_id uuid references cell_events(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  required_profile_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  resolved_at timestamptz
);

create index if not exists pending_actions_open_idx
  on pending_actions (profile_id, season_id) where resolved_at is null;

-- ---------- очки, лог, аудит ----------

create table if not exists score_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  points integer not null,
  ref_table text,
  ref_id uuid,
  created_at timestamptz not null default now(),
  unique (season_id, profile_id, kind, ref_table, ref_id)
);

create table if not exists activity_log (
  id bigserial primary key,
  season_id uuid not null,
  profile_id uuid,
  kind text not null,
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_season_idx on activity_log (season_id, created_at desc);

create table if not exists audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create table if not exists sync_runs (
  id bigserial primary key,
  provider text not null,
  endpoint text not null,
  status text not null,
  http_status integer,
  duration_ms integer,
  requests_used integer,
  error text,
  started_at timestamptz not null default now()
);

create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- фаза 2: только схема ----------

create table if not exists card_sets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('club','national')),
  title text not null,
  season_label text,
  released_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references card_sets(id),
  external_player_id text,
  player_name text not null,
  position text,
  nationality text,
  club_name text,
  club_logo text,
  photo_url text,
  overall integer check (overall between 40 and 99),
  rarity text not null check (rarity in ('common','rare','epic','legend')),
  pace integer, shooting integer, passing integer, dribbling integer, defending integer, physical integer,
  trigger_action text not null default 'goal'
    check (trigger_action in ('goal','assist','goal_or_assist','clean_sheet','card','motm')),
  points_on_trigger integer not null default 25,
  bonus_die_tier text check (bonus_die_tier in ('bronze','silver','gold')),
  unique (set_id, external_player_id)
);

create table if not exists card_instances (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id),
  owner_id uuid not null references profiles(id),
  season_id uuid not null references seasons(id),
  obtained_from text not null default 'pack',
  is_locked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists packs (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references card_sets(id),
  title text not null,
  cost_points integer not null default 0,
  cards_count integer not null default 1,
  odds jsonb not null,
  is_active boolean not null default true
);

create table if not exists pack_openings (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references packs(id),
  profile_id uuid not null references profiles(id),
  season_id uuid not null references seasons(id),
  card_instance_id uuid references card_instances(id),
  rolled_rarity text,
  idempotency_key uuid not null unique,
  opened_at timestamptz not null default now()
);

create table if not exists card_predictions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  card_instance_id uuid not null references card_instances(id),
  resolved boolean not null default false,
  triggered boolean,
  points_awarded integer not null default 0,
  unique (question_id, profile_id)
);

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  from_id uuid not null references profiles(id),
  to_id uuid not null references profiles(id),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','expired')),
  message text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists trade_items (
  trade_id uuid references trades(id) on delete cascade,
  card_instance_id uuid not null references card_instances(id),
  direction text not null check (direction in ('offer','request')),
  primary key (trade_id, card_instance_id, direction)
);

create table if not exists auctions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  cell_event_id uuid references cell_events(id),
  lot_card_instance_id uuid references card_instances(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  winner_id uuid references profiles(id),
  winning_bid integer
);

create table if not exists auction_bids (
  auction_id uuid references auctions(id) on delete cascade,
  profile_id uuid references profiles(id),
  amount integer not null,
  created_at timestamptz not null default now(),
  primary key (auction_id, profile_id)
);

-- ---------- триггеры ----------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists matches_touch on matches;
create trigger matches_touch before update on matches
  for each row execute function public.touch_updated_at();

drop trigger if exists app_config_touch on app_config;
create trigger app_config_touch before update on app_config
  for each row execute function public.touch_updated_at();

-- Ответы нельзя менять после лока вопроса (защита от подкрутки из консоли).
create or replace function public.prevent_answer_after_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock timestamptz;
begin
  select locks_at into v_lock from questions where id = new.question_id;
  if v_lock is null then
    raise exception 'QUESTION_NOT_FOUND';
  end if;
  if now() >= v_lock then
    raise exception 'QUESTION_LOCKED';
  end if;
  return new;
end;
$$;

drop trigger if exists answers_lock_check on answers;
create trigger answers_lock_check before insert or update on answers
  for each row execute function public.prevent_answer_after_lock();

-- Роль нельзя повысить самому себе.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.role is distinct from new.role and not public.is_admin() then
    raise exception 'FORBIDDEN_ROLE_CHANGE';
  end if;
  return new;
end;
$$;

-- клиентские RLS-политики определят функцию ниже; триггер создаётся после неё.
