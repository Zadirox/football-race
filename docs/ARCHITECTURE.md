# Архитектура (краткая карта)

> Компактная точка входа по устройству проекта. Подробности и исторически зафиксированные спецификации — в `docs/01-architecture.md`, `docs/02`–`07`, `docs/DECISIONS.md`, `docs/superpowers/*`. При расхождении: **код/конфигурация/тесты** показывают текущую реализацию; обязательные уточнения — в `docs/DECISIONS.md`.

## Назначение и стек (наблюдаемые факты)

- **Продукт:** приватная игра «Футбольная гонка» — предикты на реальные матчи → кубики → перемещение по карте (80 клеток) → очки/рейтинги. Параллельно реальному сезону (см. `README.md`).
- **Стек:** Next.js 15 (App Router), TypeScript (strict), React 19, Tailwind 4, Supabase (Postgres/Auth), драйвер `postgres` для транзакций, Zod, Motion/Three/R3F (карта/визуал), Howler (звук), Vitest (юнит-тесты). См. `package.json`, `docs/01-architecture.md`.
- **Режим без БД:** при отсутствии/недоступности `DATABASE_URL` приложение может работать в демо-режиме на детерминированном снимке (`lib/demo/*`, `lib/repo/season.ts`, `lib/env.ts`). Поведение в проде зависит от окружения/деплоя.

## Основные модули и ответственность

| Область | Пути (ключевые) | Ответственность |
|---|---|---|
| Маршруты/страницы | `app/(game)/**`, `app/invite/**`, `app/layout.tsx`, `app/api/cron/**` | UI-экраны игры/админки/логина/инвайтов, cron-эндпоинты |
| UI-компоненты | `components/map/**`, `components/shell/**`, `components/cards/**`, `components/ui/**` | Карта/панорама/HUD, оболочка, карточки/раскрытие, примитивы |
| Игровая логика (чистая) | `lib/game/*` | Кубики, доска/геометрия, механики, очки, lifecycle матчдэя, карточки/правила и т.п. |
| Данные матчей/вопросов | `lib/data/*` | Провайдеры (football-data, sstats), нормализация, лиги, вопросы, окна синка, имена команд |
| Граница данных/репозитории | `lib/repo/*` | Загрузка снимка сезона, синк/advance, вопросы/ответы, админ-инструменты, карточки/составы/паки, pending и др. |
| Серверные действия | `lib/actions/*` | Мутации с валидацией (Zod-схемы), вызовы repo/логики, revalidate |
| Auth/окружение/ошибки | `lib/auth/*`, `lib/env.ts`, `middleware.ts`, `lib/errors.ts`, `lib/db.ts` | Сессия/роль, переменные окружения, middleware (исключая `/api/cron`), ошибки, подключение к БД |
| БД/миграции | `supabase/migrations/*.sql` | Схема, RLS, резолв, триггеры, карточки/индексы, review и т.д. (`0001`–`0014` в репозитории) |
| Тесты | `tests/unit/**`, `tests/helpers/**`, `vitest.config.mts` | Юнит-тесты ядра/данных/репо-логики; e2e-директория по спеке может появляться отдельно |

## Точки входа и ключевые потоки

- **Веб-приложение:** `app/layout.tsx` → `(game)/layout.tsx` и страницы (`/`, `/matches`, `/predictions`, `/ratings`, `/participants`, `/effects`, `/rules`, `/admin`, `/login`, `/profile/*`, `/collection`, `/lineups` и др.). Снимок состояния сезона обычно грузится через `lib/repo/season.ts` (`loadSeasonSnapshot` / demo-fallback).
- **Cron/синк:** `app/api/cron/sync-fixtures/route.ts`, `app/api/cron/close-matchday/route.ts`, `app/api/cron/expire-pending/route.ts` — защищены `CRON_SECRET` (см. `lib/cron/auth.ts`, `docs/02-matchday-and-data.md`, `README.md`). Реальный запуск sync в проде может быть внешним (см. `docs/PROJECT_TRACKER.md`).
- **Данные матчей:** football-data (`lib/data/footballData.ts`) + sstats (`lib/data/sstats.ts`) → нормализация (`lib/data/normalize.ts`) → запись/вопросы/advance (`lib/repo/sync.ts`, `lib/repo/matchday-lifecycle`/SQL-функции резолва).
- **Игровые действия:** броски/события/pending/ответы/админ-операции — через server actions (`lib/actions/*`) и транзакции/репозитории (подход D2/D5 в `docs/DECISIONS.md`).

## Внешние зависимости и интеграции (факты из кода/доков)

- **Supabase:** Auth, Postgres (схема/RLS/функции), хранение/использование конфигурации через env (`lib/env.ts`, `.env.example`).
- **football-data.org:** фикстуры/результаты (окно дат) — `lib/data/footballData.ts`.
- **sstats.net:** матчи/детали/статистика (в т.ч. UNL и обогащение) — `lib/data/sstats.ts`, `lib/repo/sync.ts`.
- **Vercel/хостинг и cron-job.org:** деплой и внешний триггер sync упоминаются в `docs/PROJECT_TRACKER.md` (операционный контекст; подтверждать по фактической инфраструктуре при работе).

## Значимые ограничения и замечания

- Секреты/ключи не хранить в документации и не коммитить (`.env*` в `.gitignore`). `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` — серверные.
- Часть производных/операционных сведений (состояние прод-БД, таймауты, поведение cron, ручные правки данных) фиксируется в `docs/PROJECT_TRACKER.md` и `docs/WORKING_STATE.md` как наблюдения/отчёты — требует перепроверки при эксплуатации.
- Карточки/паки могут управляться env-флагами (`CARDS_ENABLED` / `NEXT_PUBLIC_CARDS_ENABLED`, см. `lib/env.ts`); фактическое поведение на деплое зависит от env и версии кода.

## Реализация и тесты (ориентиры)

- **Ключевая логика:** `lib/game/*`, `lib/data/*`, `lib/repo/*`.
- **Миграции:** `supabase/migrations/0001_schema.sql` … `0014_lineup_bonus_review.sql`.
- **Скрипты:** `scripts/seed.ts`, `scripts/bootstrap-admin.ts`, `scripts/bootstrap-season.ts`, `scripts/load-reference-data.ts` (см. `package.json`).
- **Тесты:** `tests/unit/*.test.ts`, конфиг `vitest.config.mts`.

Для детальной схемы БД, RLS, realtime, матрицы ошибок и правил матчдэя/вопросов см. `docs/01-architecture.md`, `docs/02-matchday-and-data.md`, `docs/04-mechanics.md`, `docs/DECISIONS.md`.
