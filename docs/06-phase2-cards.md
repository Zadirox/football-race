# 06. Фаза 2: карточки, паки, трейды, аукционы

> **Не реализуется до релиза 12 ноября.** В v1 создаются только таблицы и заглушка вкладки «Коллекция». Этот документ фиксирует модель, чтобы схема БД не переделывалась.

## 1. Идея

Карточки — FIFA-подобные: игрок + клуб или игрок + сборная. **Клубные и сборные — разные карточки.** Мбаппе из «Реала» и Мбаппе из Франции — две разные карты, могут выпасть обе.

Карточка влияет на игру через предикты: её можно прикрепить к матчу, и если игрок на карточке сделал заданное действие (забил, отдал голевую, получил карточку, отстоял на ноль), участник получает очки и бонус. Это связывает коллекцию с реальным футболом, а не делает её мёртвым инвентарём.

## 2. Схема БД

```sql
create table card_sets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('club','national')),
  title text not null,                  -- 'АПЛ 2026/27', 'Сборные. Евро'
  season_label text,
  released_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references card_sets(id),
  external_player_id text,              -- id из провайдера
  player_name text not null,
  position text,                        -- GK/DF/MF/FW
  nationality text,
  club_name text,
  club_logo text,
  photo_url text,
  overall integer check (overall between 40 and 99),
  rarity text not null check (rarity in ('common','rare','epic','legend')),
  pace integer, shooting integer, passing integer, dribbling integer, defending integer, physical integer,
  -- что карта умеет в предиктах
  trigger_action text not null default 'goal'
    check (trigger_action in ('goal','assist','goal_or_assist','clean_sheet','card','motm')),
  points_on_trigger integer not null default 25,
  bonus_die_tier text check (bonus_die_tier in ('bronze','silver','gold')),
  unique (set_id, external_player_id)
);

create table card_instances (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id),
  owner_id uuid not null references profiles(id),
  season_id uuid not null references seasons(id),
  obtained_from text not null default 'pack',
  is_locked boolean not null default false,  -- в активном предикте/трейде
  created_at timestamptz not null default now()
);

create table packs (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references card_sets(id),
  title text not null,
  cost_points integer not null default 0,
  cards_count integer not null default 1,
  odds jsonb not null,                  -- {"common":0.7,"rare":0.22,"epic":0.07,"legend":0.01}
  is_active boolean not null default true
);

create table pack_openings (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references packs(id),
  profile_id uuid not null references profiles(id),
  season_id uuid not null references seasons(id),
  card_instance_id uuid references card_instances(id),
  rolled_rarity text,
  idempotency_key uuid not null unique,
  opened_at timestamptz not null default now()
);

create table card_predictions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  card_instance_id uuid not null references card_instances(id),
  resolved boolean not null default false,
  triggered boolean,
  points_awarded integer not null default 0,
  unique (question_id, profile_id)
);

create table trades (
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

create table trade_items (
  trade_id uuid references trades(id) on delete cascade,
  card_instance_id uuid not null references card_instances(id),
  direction text not null check (direction in ('offer','request')),
  primary key (trade_id, card_instance_id, direction)
);

create table auctions (
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

create table auction_bids (
  auction_id uuid references auctions(id) on delete cascade,
  profile_id uuid references profiles(id),
  amount integer not null,
  created_at timestamptz not null default now(),
  primary key (auction_id, profile_id)
);
```

## 3. Правила паков

- Два пака на старте: «Клубы» и «Сборные».
- Вскрытие: сначала анимация «герб клуба / флаг страны → имя и фото игрока». Интрига держится 1.5–2 с, не больше.
- Редкости: `common` 70%, `rare` 22%, `epic` 7%, `legend` 1%. Веса в `packs.odds`, правятся админом.
- **Дубликаты не выпадают**, пока в коллекции есть неоткрытая карта этой редкости. Когда коллекция собрана — дубликат превращается в «жетоны» (валюта крафта). Решение по жетонам принимается в фазе 2.
- Пак открывается только по кнопке и только с `idempotency_key`; повторный запрос возвращает тот же результат, а не второй пак.
- Все карты — действующие футболисты на момент релиза сета. Фото и логотипы — реальные (приватный проект).

## 4. Карточка в предикте

- К обычному вопросу по матчу можно прикрепить **одну** карту игрока, участвующего в этом матче.
- Если игрок выполнил `trigger_action` → начисляются `points_on_trigger` и, если задано, выдаётся кубик указанного тира (максимум один за день, чтобы не ломать экономику).
- Привязка блокируется в момент лока вопроса. После лока карту снять нельзя.
- Одна карта не может висеть на двух вопросах одного дня (`is_locked`).
- Если карта не сработала — она не сгорает, просто возвращается в коллекцию.

## 5. Трейды и аукционы

- Трейд: предложение карт(ы) в обмен на карты(ы), статус `pending` → `accepted`/`declined`/`cancelled`/`expired` (7 дней).
- Обе стороны должны подтвердить повторно после изменений состава.
- Аукцион запускается механикой клетки: лот, срок, минимальный шаг ставки. Побеждает максимальная ставка на момент `ends_at`; при равенстве — более ранняя.
- Ставки — очками, не деньгами. Списание только у победителя.

## 6. Что должно быть готово в схеме к запуску v1

Только миграции из раздела 2. Никакого UI, кроме вкладки «Коллекция» с текстом «Откроется во втором сезоне».
