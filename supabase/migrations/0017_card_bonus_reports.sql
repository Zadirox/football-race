-- 0017: Card bonus batch reports and player seen state.
-- Stores admin batch submissions as reports so players can view awarded card bonus history.
-- Report items store snapshot fields for stable history rendering.

create table if not exists card_bonus_reports (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  source text not null default 'batch' check (source in ('batch','historical')),
  created_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb
);

create index if not exists card_bonus_reports_season_created_idx
  on card_bonus_reports (season_id, created_at desc);

create table if not exists card_bonus_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references card_bonus_reports(id) on delete cascade,
  season_id uuid not null references seasons(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  lineup_slot_id uuid references lineup_slots(id) on delete set null,
  match_id uuid references matches(id) on delete set null,
  card_instance_id uuid references card_instances(id) on delete set null,
  awarded boolean not null default false,
  points integer not null default 0 check (points >= 0),
  slot text not null check (slot in ('GK','OF1','OF2')),
  role_group text not null check (role_group in ('GK','DEF','MID','FWD')),
  rarity text not null check (rarity in ('common','rare','epic','legend')),
  rating numeric(4,1),
  card_name text not null,
  card_photo_url text,
  card_team_name text,
  home_team_name text not null,
  away_team_name text not null,
  kickoff_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists card_bonus_report_items_report_idx
  on card_bonus_report_items (report_id, created_at asc);
create index if not exists card_bonus_report_items_profile_created_idx
  on card_bonus_report_items (profile_id, created_at desc);
create index if not exists card_bonus_report_items_season_profile_idx
  on card_bonus_report_items (season_id, profile_id, created_at desc);
create index if not exists card_bonus_report_items_slot_idx
  on card_bonus_report_items (lineup_slot_id);

create table if not exists card_bonus_report_seen (
  report_id uuid not null references card_bonus_reports(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (report_id, profile_id)
);

create index if not exists card_bonus_report_seen_profile_idx
  on card_bonus_report_seen (profile_id, seen_at desc);

alter table card_bonus_reports enable row level security;
alter table card_bonus_report_items enable row level security;
alter table card_bonus_report_seen enable row level security;

-- Reports: admins can read all; players can read reports that contain their items via items policy/queries.
drop policy if exists card_bonus_reports_admin_read on card_bonus_reports;
create policy card_bonus_reports_admin_read on card_bonus_reports for select
  using (public.is_admin());

drop policy if exists card_bonus_reports_player_read on card_bonus_reports;
create policy card_bonus_reports_player_read on card_bonus_reports for select
  using (
    exists (
      select 1 from card_bonus_report_items i
      where i.report_id = card_bonus_reports.id
        and i.profile_id = auth.uid()
    )
  );

drop policy if exists card_bonus_reports_admin_write on card_bonus_reports;
create policy card_bonus_reports_admin_write on card_bonus_reports for all
  using (public.is_admin()) with check (public.is_admin());

-- Report items: player reads own; admin reads all.
drop policy if exists card_bonus_report_items_read on card_bonus_report_items;
create policy card_bonus_report_items_read on card_bonus_report_items for select
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists card_bonus_report_items_admin_write on card_bonus_report_items;
create policy card_bonus_report_items_admin_write on card_bonus_report_items for all
  using (public.is_admin()) with check (public.is_admin());

-- Seen: player manages own seen rows; admin can read.
drop policy if exists card_bonus_report_seen_read on card_bonus_report_seen;
create policy card_bonus_report_seen_read on card_bonus_report_seen for select
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists card_bonus_report_seen_insert on card_bonus_report_seen;
create policy card_bonus_report_seen_insert on card_bonus_report_seen for insert
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists card_bonus_report_seen_update on card_bonus_report_seen;
create policy card_bonus_report_seen_update on card_bonus_report_seen for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

grant select on card_bonus_reports, card_bonus_report_items, card_bonus_report_seen to authenticated;
grant insert, update on card_bonus_report_seen to authenticated;
