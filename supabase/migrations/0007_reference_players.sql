-- 0007: справочники сборных/клубов/игроков и «любимые» в профиле (задача 2, вариант A).
-- Основа для выбора любимых (задача 3) и будущих карточек. Карточки/паки/состав — отдельно.

-- ---------- справочники ----------

create table if not exists national_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_normalized text not null unique,
  created_at timestamptz not null default now()
);

-- Связь игрока со сборной (контекст для карточек сборной).
create table if not exists player_national_team_memberships (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  national_team_id uuid not null references national_teams(id) on delete cascade,
  position text not null default '',
  role_group text not null default '' check (role_group in ('', 'GK', 'DEF', 'MID', 'FWD')),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (player_id, national_team_id)
);

-- Связь игрока с клубом (контекст для клубных карточек).
create table if not exists player_club_memberships (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  position text not null default '',
  role_group text not null default '' check (role_group in ('', 'GK', 'DEF', 'MID', 'FWD')),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (player_id, club_id)
);

create index if not exists players_name_idx on players (name);
create index if not exists player_nt_memberships_team_idx on player_national_team_memberships (national_team_id);
create index if not exists player_nt_memberships_player_idx on player_national_team_memberships (player_id);
create index if not exists player_club_memberships_club_idx on player_club_memberships (club_id);
create index if not exists player_club_memberships_player_idx on player_club_memberships (player_id);

-- ---------- «любимые» в профиле ----------

alter table profiles
  add column if not exists favorite_national_team_id uuid references national_teams(id) on delete set null,
  add column if not exists favorite_club_id uuid references clubs(id) on delete set null,
  add column if not exists favorite_player_id uuid references players(id) on delete set null;

create index if not exists profiles_favorite_national_team_idx on profiles (favorite_national_team_id);
create index if not exists profiles_favorite_club_idx on profiles (favorite_club_id);
create index if not exists profiles_favorite_player_idx on profiles (favorite_player_id);

-- ---------- доступ ----------

alter table national_teams enable row level security;
alter table clubs enable row level security;
alter table players enable row level security;
alter table player_national_team_memberships enable row level security;
alter table player_club_memberships enable row level security;

-- Справочники: читать всем (нужны для выбора любимых), менять только админу.
drop policy if exists national_teams_read on national_teams;
create policy national_teams_read on national_teams for select using (true);
drop policy if exists national_teams_admin on national_teams;
create policy national_teams_admin on national_teams for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists clubs_read on clubs;
create policy clubs_read on clubs for select using (true);
drop policy if exists clubs_admin on clubs;
create policy clubs_admin on clubs for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists players_read on players;
create policy players_read on players for select using (true);
drop policy if exists players_admin on players;
create policy players_admin on players for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists player_nt_memberships_read on player_national_team_memberships;
create policy player_nt_memberships_read on player_national_team_memberships for select using (true);
drop policy if exists player_nt_memberships_admin on player_national_team_memberships;
create policy player_nt_memberships_admin on player_national_team_memberships for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists player_club_memberships_read on player_club_memberships;
create policy player_club_memberships_read on player_club_memberships for select using (true);
drop policy if exists player_club_memberships_admin on player_club_memberships;
create policy player_club_memberships_admin on player_club_memberships for all
  using (public.is_admin()) with check (public.is_admin());

grant select on national_teams, clubs, players, player_national_team_memberships, player_club_memberships to anon, authenticated;
grant insert, update, delete on national_teams, clubs, players, player_national_team_memberships, player_club_memberships to authenticated;
