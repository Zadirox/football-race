-- 0005: одноразовые приглашения (вход по нику, без email).
-- Инвайт привязывает ник к активному сезону как player; ссылка одноразовая.

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  nickname text not null,
  season_id uuid not null references seasons(id) on delete cascade,
  role user_role not null default 'player',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  used_by uuid references profiles(id) on delete set null
);

create index if not exists invites_season_idx on invites (season_id, created_at desc);
create index if not exists invites_nickname_idx on invites (lower(nickname));

-- Один активный (неиспользованный) инвайт на ник в рамках сезона.
create unique index if not exists invites_active_nickname_season_idx
  on invites (season_id, lower(nickname))
  where used_at is null;

alter table invites enable row level security;

-- Только админ видит и управляет приглашениями (создание/список/отзыв).
drop policy if exists invites_admin_select on invites;
create policy invites_admin_select on invites for select
  using (public.is_admin());

drop policy if exists invites_admin_insert on invites;
create policy invites_admin_insert on invites for insert
  with check (public.is_admin());

drop policy if exists invites_admin_update on invites;
create policy invites_admin_update on invites for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists invites_admin_delete on invites;
create policy invites_admin_delete on invites for delete
  using (public.is_admin());

-- Принятие инвайта (по токену, без сессии) выполняется только через сервер
-- с service role; клиентских политик на чтение по токену намеренно нет.
