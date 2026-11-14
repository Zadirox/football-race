-- 0011: cards national MVP tables and constraints (additive, idempotent).
-- Extends phase-2 card tables for national-teams packs, collection, lineups, and bonuses.
-- Server mutations use db() service connection; RLS/policies below are defense-in-depth.

-- ---------- cards: national template fields ----------
alter table cards
  add column if not exists national_team_id uuid references national_teams(id),
  add column if not exists player_id uuid references players(id),
  add column if not exists role_group text,
  add column if not exists rating integer;

do $$ begin
  alter table cards
    add constraint cards_role_group_check
    check (role_group is null or role_group in ('GK', 'DEF', 'MID', 'FWD'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table cards
    add constraint cards_rating_check
    check (rating is null or rating between 1 and 99);
exception when duplicate_object then null; end $$;

-- Deterministic template identity for national cards (dedupe per set/team/player).
create unique index if not exists cards_national_template_uidx
  on cards (set_id, player_id, national_team_id)
  where player_id is not null and national_team_id is not null;

-- ---------- pack_grants: unopened/opened pack inventory ----------
create table if not exists pack_grants (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  pack_id uuid not null references packs(id),
  source text not null,
  matchday_id uuid references matchdays(id) on delete set null,
  cell_event_id uuid references cell_events(id) on delete set null,
  grant_index integer not null default 1,
  granted_at timestamptz not null default now(),
  opened_at timestamptz,
  opened_opening_id uuid references pack_openings(id) on delete set null
);

do $$ begin
  alter table pack_grants
    add constraint pack_grants_source_check
    check (source in ('admin', 'matchday', 'cell'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table pack_grants
    add constraint pack_grants_grant_index_check
    check (grant_index >= 1);
exception when duplicate_object then null; end $$;

-- Idempotency: one grant per matchday slot, one pack per cell event per player.
create unique index if not exists pack_grants_matchday_uidx
  on pack_grants (matchday_id, profile_id, grant_index)
  where matchday_id is not null;

create unique index if not exists pack_grants_cell_uidx
  on pack_grants (cell_event_id, profile_id)
  where cell_event_id is not null;

create index if not exists pack_grants_profile_season_idx
  on pack_grants (profile_id, season_id);
create index if not exists pack_grants_open_idx
  on pack_grants (profile_id, season_id, opened_at)
  where opened_at is null;

-- ---------- pack_openings: link to grant, one opening per grant ----------
alter table pack_openings
  add column if not exists pack_grant_id uuid references pack_grants(id) on delete set null;

create unique index if not exists pack_openings_grant_uidx
  on pack_openings (pack_grant_id)
  where pack_grant_id is not null;

-- ---------- card_instances: no duplicate template per owner in season ----------
create unique index if not exists card_instances_owner_card_uidx
  on card_instances (owner_id, season_id, card_id);

-- ---------- lineups ----------
create table if not exists lineup_slots (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  matchday_id uuid not null references matchdays(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  card_instance_id uuid not null references card_instances(id) on delete cascade,
  slot text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table lineup_slots
    add constraint lineup_slots_slot_check
    check (slot in ('GK', 'OF1', 'OF2'));
exception when duplicate_object then null; end $$;

create unique index if not exists lineup_slots_match_profile_slot_uidx
  on lineup_slots (match_id, profile_id, slot);

create unique index if not exists lineup_slots_match_profile_card_uidx
  on lineup_slots (match_id, profile_id, card_instance_id);

create index if not exists lineup_slots_match_profile_idx
  on lineup_slots (match_id, profile_id);
create index if not exists lineup_slots_season_profile_idx
  on lineup_slots (season_id, profile_id);

create table if not exists lineup_card_results (
  id uuid primary key default gen_random_uuid(),
  lineup_slot_id uuid not null references lineup_slots(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  card_instance_id uuid not null references card_instances(id) on delete cascade,
  rarity text not null,
  points integer not null,
  awarded boolean not null default false,
  method text not null,
  awarded_at timestamptz,
  awarded_by uuid references profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table lineup_card_results
    add constraint lineup_card_results_method_check
    check (method in ('auto', 'manual'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table lineup_card_results
    add constraint lineup_card_results_rarity_check
    check (rarity in ('common', 'rare', 'epic', 'legend'));
exception when duplicate_object then null; end $$;

create unique index if not exists lineup_card_results_slot_uidx
  on lineup_card_results (lineup_slot_id);

create unique index if not exists lineup_card_results_match_profile_card_uidx
  on lineup_card_results (match_id, profile_id, card_instance_id);

create index if not exists lineup_card_results_match_idx
  on lineup_card_results (match_id);
create index if not exists lineup_card_results_profile_match_idx
  on lineup_card_results (profile_id, match_id);

-- ---------- RLS ----------
alter table pack_grants enable row level security;
alter table lineup_slots enable row level security;
alter table lineup_card_results enable row level security;

-- pack_grants: players read own; admins read all. Writes via service (db()) for idempotent grants/open flow.
drop policy if exists pack_grants_read on pack_grants;
create policy pack_grants_read on pack_grants for select
  using (profile_id = auth.uid() or public.is_admin());

-- lineup_slots: players read own; admins read all.
-- Writes restricted to service/admin path so kickoff, ownership, team and role checks are enforced server-side.
drop policy if exists lineup_slots_read on lineup_slots;
create policy lineup_slots_read on lineup_slots for select
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists lineup_slots_admin_all on lineup_slots;
create policy lineup_slots_admin_all on lineup_slots for all
  using (public.is_admin()) with check (public.is_admin());

-- lineup_card_results: players read own; admins read all. Writes admin/service only.
drop policy if exists lineup_card_results_read on lineup_card_results;
create policy lineup_card_results_read on lineup_card_results for select
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists lineup_card_results_admin_all on lineup_card_results;
create policy lineup_card_results_admin_all on lineup_card_results for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- grants ----------
-- Read access for own/admin rows via RLS; mutations are performed server-side (db() service role)
-- or by admins via service paths, so authenticated clients only need select.
grant select on pack_grants, lineup_slots, lineup_card_results to authenticated;
