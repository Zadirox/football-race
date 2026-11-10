# 01. Архитектура

## 1. Стек и почему так

| Слой | Выбор | Причина |
|---|---|---|
| Фронт | Next.js 15 App Router, TS strict, Tailwind | SSR для быстрых первых экранов, server actions для мутаций |
| БД | Supabase Postgres | бесплатный лимит покрывает 6 игроков с гигантским запасом (500 МБ, 2 ГБ трафика) |
| Auth | Supabase Auth, email + пароль | без magic link, как просил заказчик |
| Realtime | Supabase Realtime (postgres_changes + broadcast) | заменяет socket.io-сервер, не требует отдельного процесса |
| Планировщик | pg_cron + pg_net → Edge Function | синк живёт на сервере, доступность РФ не влияет |
| Хостинг | Vercel | бесплатно, быстрый деплой; серверные вызовы идут из EU/US |
| Звук | Howler.js | как у референса, надёжный мьют/лонч |
| UI-анимации | Motion | декларативные переходы, layout-анимации |
| Амбиент карты | CSS keyframes + transform | дешевле JS-цикла, не грузит main thread |

Почему не свой socket-сервер: на бесплатном хостинге процесс засыпает, соединение рвётся, нужен Redis для масштабирования. Для 6 игроков это чистый риск без выгоды.

## 2. Структура репозитория

```
app/
  (app)/
    map/page.tsx            # главный экран
    matches/page.tsx
    predictions/page.tsx
    ratings/page.tsx
    effects/page.tsx
    rules/page.tsx
    participants/page.tsx
    profile/[id]/page.tsx
    admin/...
  (auth)/login/page.tsx
  api/
    cron/sync-fixtures/route.ts
    cron/close-matchday/route.ts
    cron/expire-pending/route.ts
components/
  map/            # сцена, маркеры, персонажи, панорама
  game/           # кубик, карточка события, мини-игры
  ui/             # базовые примитивы
lib/
  supabase/{client,server,admin}.ts
  game/           # чистые функции движка (тестируемые)
    dice.ts  effects.ts  scoring.ts  board.ts
  data/           # провайдеры футбольных данных
    footballDataOrg.ts  rapidapi.ts  normalize.ts
  time.ts
  errors.ts
supabase/
  migrations/
  functions/sync-football/
tests/
  unit/  e2e/
docs/
```

Правило: вся игровая математика в `lib/game/*` — чистые функции без БД, чтобы их можно было покрыть юнит-тестами. В БД они же дублируются только для критичных инвариантов (бросок, выдача кубика).

## 3. Модель данных

Все таблицы в `public`, RLS включён. Время — `timestamptz` (UTC). Деньги/очки — `integer`.

### 3.1 Профили и сезоны

```sql
create type user_role as enum ('admin','player','spectator');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 24),
  avatar_url text,
  role user_role not null default 'player',
  created_at timestamptz not null default now()
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,             -- 'winter-2026'
  title text not null,                   -- 'Зимний сезон 2026'
  status text not null default 'draft' check (status in ('draft','active','finished')),
  starts_on date not null,
  ends_on date not null,
  board_seed integer not null,           -- детерминированная раскладка клеток
  art_variant text not null default 'late-autumn-winter',
  created_at timestamptz not null default now()
);

create table season_players (
  season_id uuid references seasons(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  position integer not null default 1 check (position between 1 and 80),
  joined_at timestamptz not null default now(),
  is_active boolean not null default true,
  primary key (season_id, profile_id)
);
```

### 3.2 Карта

```sql
create table cells (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  idx integer not null check (idx between 1 and 80),
  kind text not null check (kind in ('start','plain','event','finish')),
  mechanic_code text,                    -- '01'..'18' для kind='event'
  config jsonb not null default '{}',    -- параметры конкретной клетки
  x numeric not null,                    -- нормализованные координаты 0..1 по фону
  y numeric not null,
  zone text not null default 'winter',   -- 'autumn' | 'winter' (визуальная зона)
  unique (season_id, idx)
);
```

Раскладка генерируется один раз при создании сезона из `board_seed` (см. `04-mechanics.md`, раздел «Раскладка»). Меняется только админом, с записью в `audit_log`.

### 3.3 Матчи, дни, вопросы

```sql
create table matchdays (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  game_date date not null,               -- дата игрового дня по МСК
  opens_at timestamptz not null,         -- 09:00 МСК дня game_date
  closes_at timestamptz not null,        -- 08:59:59 МСК следующего дня
  status text not null default 'scheduled'
    check (status in ('scheduled','locked','live','resolving','closed')),
  q_total integer,                       -- итоговое число действительных вопросов
  resolved_at timestamptz,
  unique (season_id, game_date)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  league_code text not null,             -- 'PL','PD','SA','BL1','FL1','CL','UNL'
  league_title text not null,
  home_name text not null, home_logo text,
  away_name text not null, away_logo text,
  kickoff_utc timestamptz not null,
  status text not null default 'NS'
    check (status in ('NS','LIVE','HT','FT','PST','CANC','ABD')),
  minute integer,
  home_score integer, away_score integer,
  raw jsonb,
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create table matchday_matches (
  matchday_id uuid references matchdays(id) on delete cascade,
  match_id uuid references matches(id) on delete cascade,
  in_scope boolean not null default true,   -- админ может исключить матч из дня
  primary key (matchday_id, match_id)
);

create type question_kind as enum ('choice','yes_no','exact_score');

create table questions (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references matchdays(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  kind question_kind not null,
  prompt text not null,                  -- 'ТМ 2.5 в матче Реал — ПСЖ'
  options jsonb not null,                -- [{"key":"yes","label":"Да"},{"key":"no","label":"Нет"}]
  correct_option text,                   -- заполняется движком после матча
  locks_at timestamptz not null,         -- = kickoff матча
  is_bonus boolean not null default false,  -- точный счёт: не входит в Q
  status text not null default 'open' check (status in ('open','locked','resolved','void')),
  source text not null default 'auto' check (source in ('auto','manual'))
);

create table answers (
  question_id uuid references questions(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  choice text not null,
  is_correct boolean,
  submitted_at timestamptz not null default now(),
  primary key (question_id, profile_id)
);
```

### 3.4 Кубики, броски, события

```sql
create type dice_tier as enum ('wood','bronze','silver','gold');

create table dice (
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
-- инвариант: один кубик категории matchday на игрока за день
create unique index dice_one_matchday_die
  on dice (matchday_id, profile_id, source)
  where source in ('matchday','exact_score','catchup');

create table rolls (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  profile_id uuid not null references profiles(id),
  dice_id uuid not null unique references dice(id),
  base_value integer not null,           -- что выпало на кубике
  value integer,                         -- итог после модификаторов, заполняется при перемещении
  from_position integer not null,
  to_position integer,                   -- null до перемещения (см. DECISIONS D5)
  state text not null default 'pending_move'
    check (state in ('pending_move','moved')),
  modifiers jsonb not null default '{}',
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

create table cell_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  profile_id uuid not null references profiles(id),
  roll_id uuid not null references rolls(id),
  cell_idx integer not null,
  mechanic_code text,
  rule_version integer not null default 1,
  state text not null default 'pending'
    check (state in ('pending','awaiting_choice','awaiting_other','resolved','cancelled')),
  payload jsonb not null default '{}',
  outcome jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table active_effects (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  profile_id uuid not null references profiles(id),
  code text not null,
  charges integer not null default 1,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table pending_actions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  profile_id uuid not null references profiles(id),
  event_id uuid references cell_events(id) on delete cascade,
  kind text not null,                    -- 'var','tactics','relegation_choice','duel_penalty'
  payload jsonb not null default '{}',
  required_profile_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
```

### 3.5 Очки, лог, аудит

```sql
create table score_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id),
  profile_id uuid not null references profiles(id),
  kind text not null,                    -- 'prediction_hit','exact_score','cell_event','achievement'
  points integer not null,
  ref_table text, ref_id uuid,
  created_at timestamptz not null default now(),
  unique (season_id, profile_id, kind, ref_table, ref_id)
);

create table activity_log (
  id bigserial primary key,
  season_id uuid not null,
  profile_id uuid,
  kind text not null,
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb, after jsonb,
  created_at timestamptz not null default now()
);

create table sync_runs (
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

create table app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
```

`app_config` хранит все числа, которые хочется крутить без деплоя: пороги кубиков, очки за действия, веса механик.

### 3.6 Фаза 2 — создать пустыми сразу

`card_sets`, `cards`, `card_instances`, `packs`, `pack_openings`, `trades`, `trade_items`, `auctions`, `auction_bids`, `card_predictions`. Схема — в `06-phase2-cards.md`. В v1 они не читаются UI, но миграция уже есть, чтобы потом не переписывать связи.

## 4. RLS

| Таблица | player | spectator | admin |
|---|---|---|---|
| `profiles` | чтение всех | чтение всех | всё |
| `answers` | свои всегда; чужие только после `questions.locks_at` | чужие после лока | всё |
| `questions` | чтение, `correct_option` скрыт до резолва | чтение, скрыт | всё |
| `dice`, `rolls` | свои + чтение чужих | чтение | всё |
| `cell_events`, `pending_actions` | свои + чтение | чтение | всё |
| `seasons`, `cells`, `matches` | чтение | чтение | всё |
| `score_events`, `activity_log` | чтение | чтение | всё |
| `audit_log`, `sync_runs` | нет | нет | всё |

Скрытие `correct_option` делать через view `questions_public` или column-level grant, а не через `select('*')` в клиенте.

## 5. Действия, меняющие состояние

По `DECISIONS D2`: интерактивная логика — серверные экшены на TypeScript в одной транзакции драйвера `postgres`. В Postgres остаются только пакетный резолв и админские операции.

| Действие | Где | Что делает | Защита |
|---|---|---|---|
| `rollDice(p_dice, p_idem)` | server action + transaction | проверяет владельца, непотраченность и отсутствие блокирующего `pending_action`, кидает RNG, применяет Трибуны/Газон, пишет `rolls` в `state='pending_move'` | `FOR UPDATE` на кубик и игрока, `unique(dice_id)`, `unique(idempotency_key)` |
| `chooseTactics(p_roll, p_delta)` | server action | фиксирует `value`, двигает позицию, `state='moved'`, создаёт `cell_event` | `state='pending_move'` проверяется в транзакции |
| `chooseEventOption(p_event, p_choice, p_idem)` | server action | применяет выбор игрока (VAR, Раздевалка, Голевая передача) | `state='awaiting_choice'` проверяется в транзакции |
| `choosePartnerOption(p_event, p_choice)` | server action | ответ второго участника | обе стороны фиксируются до раскрытия |
| `rpc_resolve_matchday(p_matchday)` | PL/pgSQL, `SECURITY DEFINER` | закрывает вопросы, считает correct, Q, C, выдаёт кубики и очки, пишет лог | вызывается только сервис-ролью/cron; `resolved_at` под уникальным условием |
| `rpc_recalculate_matchday(p_matchday, p_reason)` | PL/pgSQL, `SECURITY DEFINER` | пересчёт дня, если кубики дня не потрачены (D3) | только admin, пишет `audit_log` |
| `rpc_admin_set_position(p_season, p_profile, p_pos, p_reason)` | PL/pgSQL | правка позиции | только admin, `audit_log` |

Все действия возвращают `{ ok: true, data }` либо `{ ok: false, code, message }`.

## 6. Realtime

| Канал | События |
|---|---|
| `season:{id}` | изменения `season_players` (позиции), `rolls`, `cell_events`, `activity_log` |
| `matchday:{id}` | `questions`, `answers` (после лока), `matches` (счёт/минута) |

Клиент подписывается на канал сезона один раз на мап-экране. При реконнекте — полный рефетч через server action, а не попытка «догнать» пропущенные события. Realtime — это ускорение, а не источник истины.

## 7. Ошибки

`lib/errors.ts`:

```ts
export type AppErrorCode =
  | 'AUTH_REQUIRED' | 'FORBIDDEN'
  | 'DICE_ALREADY_USED' | 'NO_DICE' | 'PENDING_ACTION_BLOCKS_ROLL'
  | 'QUESTION_LOCKED' | 'MATCHDAY_NOT_READY'
  | 'SYNC_QUOTA_EXCEEDED' | 'SYNC_PROVIDER_DOWN'
  | 'CONFLICT_RETRY';
```

Правила:
- RPC кидает `RAISE EXCEPTION` с кодом в `DETAIL`; слой `lib/errors.ts` переводит его в `AppError` с русским текстом.
- UI показывает `message`, в консоль — только код и контекст без секретов.
- Ошибка синка не ломает игру: страницы показывают кэш + бейдж «данные от 14:32».
- Любая мутация оптимистично не применяется. Сначала ответ сервера, потом UI. Для броска это критично.

## 8. Переменные окружения

`.env.example` (только имена):

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
FOOTBALL_DATA_TOKEN
RAPIDAPI_KEY
RAPIDAPI_HOST
ADMIN_EMAILS
CRON_SECRET
SEED_PASSWORD
```

Короткие имена `SUPABASE_*` и `DATABASE_URL` — основные; `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_DB_URL` и `FOOTBALL_DATA_ORG_TOKEN` читаются как запасные (`lib/env.ts`).

`SUPABASE_SERVICE_ROLE_KEY` и `CRON_SECRET` не попадают в клиентский бандл. Проверять: `grep -r "SERVICE_ROLE" app components lib` не должен находить использования вне `lib/supabase/admin.ts`.
