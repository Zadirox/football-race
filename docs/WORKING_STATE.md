# Текущее рабочее состояние

Краткая актуальная сводка для продолжения работы (в т.ч. после `/compact` и в новой сессии). Расширенная история, планы и бэклог — в `docs/PROJECT_TRACKER.md`. Правила работы агента и восстановления контекста — в `AGENTS.md`.

## Текущая цель
- Подготовить и реализовать клубный этап (ЛЧ/ЛЕ/ЛК + whitelist-матчи топ-лиг, отдельные клубные паки/карточки) при сохранении совместимости основы. **Этапы 1–3 (C)** и **Stage 4 MVP (шаг 1 варианта C, D4.1–D4.4=A)** реализованы локально в согласованном объёме. Релиз/деплой/коммиты не выполнялись. Базовый коммит: `4a291b2` (`feat: make lineup bonuses fully manual`, ветка `frontend-finish`). Дальше — валидация и возврат к **D4.4 / Stage 4 шаг 2** по отдельному согласованию (пользователь просил запомнить).

## Что выполнено (подтверждённые факты)
- **Код/ветка:** `frontend-finish`, HEAD `4a291b2` (коммиты/пуш не выполнялись). В рабочем дереве есть локальные uncommitted изменения (runtime Этапы 1–3, data/config/tests/docs/migration/script, `tmp/`, ассеты и др.) — см. git status.
- **Этап 1 (C, подтверждён 2026-11-21) — карточный runtime-фундамент, реализован локально:**
  - `lib/game/cards.ts`: параметризованные odds (`NATIONAL_RARITY_ODDS`, `CLUB_RARITY_ODDS` 55/28/13/4), `CLUB_BONUS_SECOND_CHANCE=10`, `rollRarity(random, odds)`, A+ (1 гарант. + 10% шанс 2-й, независимые роллы), совместимость national сохранена.
  - `lib/types.ts`, `lib/repo/cards.ts`: multi-set/pack/club поля, `pack_opening_cards`, открытие 1–2 карт без дублей, коллекция/прогресс по сетам, legacy-совместимость.
  - `lib/repo/lineups.ts`, `app/(game)/collection/*`, `components/cards/PackOpenReveal.tsx`, actions: multi-set данные, **последовательный ревил 2 карт (1A)** и **вкладки Сборные/Клубы (2A)**. Без T1, без sync club-phase, без клубных линеек. Миграция 0015 и 491 карта в prod были загружены ранее (2C.5b/c).
- **Этап 2 (C, вариант B, подтверждён 2026-11-21) — T1-гранты и классификация матчдэев, реализован локально (fail-safe):**
  - `lib/repo/cards-grants.ts`: config-driven классификация in-scope матчей — `national` (UNL/`league_code=UNL`) → `a001`; `club` (все однозначно в клубных comps config, по sstats league id в `raw` и/или `league_code`) → T1 в `a002`; `none`/`ambiguous`/mixed/unknown → **без авто-гранта** (причина/лог). Идемпотентность `(matchday_id,profile_id,grant_index)`, gold→2 пака. Коды/ид derived из `CLUB_COMPETITIONS`.
  - `lib/repo/sync.ts`: `advanceMatchdays` использует обобщённый grant hook; безопасные пропуски логируются, реальные сбои гранта попадают в report.
  - Границы: без sync-интеграции Этапа 3 и без клубных линеек Этапа 4. UNL-дни классифицируются как national.
- **Этап 3 (C, вариант B, подтверждён и реализован локально 2026-11-21) — sync-интеграция клубного этапа (Y4, без Stage 4):**
  - **3.1=A:** даты, где есть national (UNL) in-scope матчи, считаются national-only — club in-scope матчи на этих датах **исключаются** из прикрепления к матчдэю (логируются), mixed матчдэи не создаются, схема БД не менялась.
  - **3.2=A:** канонический `league_code` per included comp + `sstatsLeagueId` сохраняется в `raw`; маппинг из `CLUB_COMPETITIONS`.
  - **3.3=A:** все included comps прогоняются за запуск, **best-effort** в пределах budget/deadline (еврокубки приоритетнее), идемпотентно.
  - **Y4 scope sync comps (9):** `CL`(2), `EL`(3), `ECL`(848), `PL`(39), `PD`(140), `BL1`(78), `SA`(135), `FL1`(61), `SLTR`(203), Year=2026, sstats primary / FD reserve. Домашние лиги Eredivisie, Primeira, Eliteserien, Jupiler Pro BE, Bundesliga AT, Super League GR, Czech Liga, Super Liga SK, UPL, Premyer Liqa AZ **убраны из comps/sync**, но их клубы **остаются в `CLUB_WHITELIST`** для UEL/UECL (whitelist-only); UCL — все матчи.
  - **Реализация:**
    - `lib/data/club-phase.ts`: Y4 `CLUB_COMPETITIONS` с `leagueCode`, whitelist 54 сохранён, добавлены нормализация/матчинг алиасов (`matchWhitelistClub`, `isWhitelistedClubMatch`).
    - `lib/data/sstats.ts`: обобщённый fetch/normalize (`normalizeSstatsGame`, `fetchSstatsFixtures`) + UNL-обёртки для совместимости.
    - `lib/repo/sync.ts`: интеграция club comps (sstats) с whitelist-only фильтром (по нормализованным alias/name), 3.1=A exclusion, merge групп с **приоритетом sstats** (no FD overwrite sstats canonical, merge + coalesce), дедуп provider+external_id + существующая time/team эвристика, best-effort/budget, переиспользование сохранённой статистики/обогащение и advance/grants flow сохранены.
    - `lib/repo/cards-grants.ts`, `tests/unit/cards-grants-classification.test.ts`: выровнены под Y4 (removed comps/codes/ids → unknown/fail-safe).
  - Границы: без миграций БД, без Stage 4 (клубные линейки/правила), без деплоя.
- **Stage 4 MVP (C, шаг 1, D4.1–D4.4=A, подтверждён 2026-11-21) — клубные линейки «как у сборных», реализовано локально:**
  - **D4.1=A:** матчинг клубной карточки к стороне матча по клубной сущности/whitelist-алиасам (`lib/data/club-phase.ts`) в клубных contest-матчах (league_code из club comps); national-матчинг сохранён.
  - **D4.2=A:** матчи показываются в составах при наличии ≥1 подходящей карты (как ранее).
  - **D4.3=A / D4.4=A:** единый флоу/UI без разделения national/club, минимальные необходимые правки (без миграций, без UX-полировки).
  - **Реализация:** `lib/game/lineup-eligibility.ts` (общая eligibility/side/match helpers), `lib/repo/lineups.ts` (league_code в контексте, club-aware валидация/матчинг в upsert, корректные сообщения), `lib/types.ts` (`MatchLineupView.leagueCode`), `app/(game)/lineups/page.tsx` и `app/(game)/lineups/LineupsClient.tsx` (подбор допустимых карт/лейблы с учётом club).
  - Границы: без миграций БД, без изменения бонусных правил/спец-логики, без отдельного club-UI. **Вернуться позже к D4.4** (UX/объём) — по запросу пользователя.
- **Файловая память проекта (docs):** `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/WORKING_STATE.md`, `docs/decisions/README.md`, `docs/decisions/0001-club-phase-source-sync-cards-direction.md` поддерживаются; в `AGENTS.md` зафиксированы протоколы, правило согласования и использование `impeccable`/`taste-skill` (A+C) для UI/фронтенда.
- **2C.1–2C.5 и операционные шаги (ранее, подтверждено):** whitelist-конфиг/алиасы, решения 2C.2–2C.4 (A, B/sstats primary, scopes, Year=2026, M1/T1/A+/C odds, 24 клуба/491), 2C.5a мастер `data/club-cards.master.json`, 2C.5b/c migration 0015 применена и `scripts/load-club-cards.ts` выполнен в **PROD** (491, c002/a002). План B для матчдэя `2026-11-20` выполнен в проде (закрыт/skipped). Ассеты/портреты/SoFIFA/rembg работы — см. историю ниже и `docs/PROJECT_TRACKER.md`.
- **Клубный объём:** 54 клуба для матчей/предиктов (UCL все; UEL/UECL и дом. лиги — только матчи с участием whitelist 54; дом. лиги в sync по Y4), 24 клуба для карточек (491 игрок), 1 дата = 1 матчдэй, ~4 вопроса/матч.

## Что выполнено/наблюдалось ранее (по трекеру — требует перепроверки при эксплуатации)
- Прод-окружение (Supabase/Vercel), состояние сезона `winter-2026`, миграции до `0013` (по трекеру, плюс 0015 по факту 2C.5b/c), внешнее расписание sync (cron-job.org), ограничения по таймаутам и ручные правки прод-БД описаны в `docs/PROJECT_TRACKER.md`. **В этой сессии напрямую не перепроверялись.**

## Какие файлы затронуты
- **Stage 4 MVP (agent, локально, uncommitted):** `lib/game/lineup-eligibility.ts`, `lib/repo/lineups.ts`, `lib/types.ts`, `app/(game)/lineups/page.tsx`, `app/(game)/lineups/LineupsClient.tsx`, `docs/WORKING_STATE.md`, `docs/decisions/0001-club-phase-source-sync-cards-direction.md`.
- **Этап 3 (ранее, локально, uncommitted):** `lib/data/club-phase.ts`, `lib/data/sstats.ts`, `lib/repo/sync.ts`, `lib/repo/cards-grants.ts`, `tests/unit/cards-grants-classification.test.ts`.
- **Этапы 1–2 (ранее в этой цепочке, локально uncommitted):** `lib/game/cards.ts`, `lib/types.ts`, `lib/repo/cards.ts`, `app/(game)/collection/*`, `components/cards/PackOpenReveal.tsx`, связанные actions/tests.
- **Конфиг (подтверждённое изменение):** `tsconfig.json` — `tmp` добавлен в `exclude` (согласовано, вариант A), чтобы pre-existing tmp-скрипты не блокировали build/typecheck.
- **Ранее/прочее (не коммитить без отдельного решения):** `data/club-cards.master.json`, `supabase/migrations/0015_club_cards_mvp.sql`, `scripts/load-club-cards.ts`, docs/решения, `players_champions.txt`, `tmp/portrait-prompts-clubs.md`, `public/cards/clubs/**`, `tmp/**`, `.playwright-mcp/`, `сборные/`, `клубы/`, `пример.webp`, возможны `.env.local` и др. (см. `docs/PROJECT_TRACKER.md`).

## Что осталось
- **Stage 4 шаг 2 (ожидает согласования позже):** возврат к **D4.4** и уточнение/расширение клубных линеек (UX: эмблемы/визуал/разделение, продуктовые правила бонусов/матчинга/ограничений) — после валидации MVP.
- **Проверки/валидация:** ручная/интеграционная проверка клубного sync, классификации, грантов (в т.ч. 3.1=A) и **клубных линеек (D4.1=A)** на реальных/тестовых данных; деградации/budget/конфликтов источников; `npm run build` не запускался; `npm run lint` в текущем окружении падает из-за интерактивного/устаревшего `next lint` (не исправлялось).
- **Опционально:** выборочная проверка выреза портретов, актуализация SoFIFA-артефактов с учётом удалённых игроков.
- **Эксплуатация:** подтверждение прод-деплоя (Vercel), актуальность cron-job.org, состояние матчдэев/БД, поведение sync/грантов/линеек на проде после выката кода.

## Уже согласованные решения и границы согласования
- **Структура файловой памяти, правило согласования вариантов, UI-скиллы `impeccable`/`taste-skill` (A+C)** — зафиксированы в `AGENTS.md`.
- **2C.1:** whitelist 54 клубов — конфиг в репо (`lib/data/club-phase.ts`), алиасы подтверждены; финальные правила матчинга/дедупа при sync уточняются при необходимости.
- **2C.2:** окно синка **`[-1, +1]`**.
- **2C.3:** sstats primary (FD reserve), приоритет sstats при конфликте, Year=2026; scope UCL все, UEL/UECL и дом. лиги — whitelist-only. **Этап 3 (подтверждено 2026-11-21): 3.1=A, 3.2=A, 3.3=A**. **Y4:** sync comps = 9 (CL/EL/ECL/PL/PD/BL1/SA/FL1/SLTR); 10 дом. лиг удалены из sync, их клубы остаются в whitelist для UEL/UECL.
- **2C.4 (B, подтверждено 2026-11-21):** общий клубный пак, 24 клуба, пороги 88+/84–87/80–83/≤79, odds C 55/28/13/4, **A+** 1 гарант + 10% на 2-ю (независимые роллы), **T1** гранты по resolved клубному матчдэю (gold→2), **M1** единый club set c002 / pack a002.
- **2C.5:** 2C.5a мастер принят; 2C.5b/c migration 0015 и загрузка 491 карт в **PROD** выполнены по явным подтверждениям (2026-11-21). Runtime-интеграция — по этапам C.
- **Этап 1 (подтверждено, выполнен локально):** A+ 1–2, `pack_opening_cards`, odds a002, multi-set UI/progress; UX **1A** (последовательно) и **2A** (вкладки).
- **Этап 2 (подтверждено, вариант B, выполнен локально):** config-driven классификация + fail-safe, T1 a002, идемпотентность, без sync Stage 3 и без линеек Stage 4.
- **Этап 3 (подтверждено, вариант B, выполнен локально):** Y4 comps, 3.1=A/3.2=A/3.3=A, sstats primary + merge priority, whitelist-only фильтр, без миграций и без Stage 4.
- **Stage 4 MVP (C, шаг 1, подтверждено 2026-11-21, выполнен локально):** **D4.1=A, D4.2=A, D4.3=A, D4.4=A** — 3 слота на матч клуба «как у сборных», матчинг клубных карт по клубной сущности/whitelist-алиасам, показ матчей при ≥1 подходящей карте, единый флоу/UI, минимальный объём без миграций/UX-полировки.
- **D1-A (подтверждено 2026-11-21, реализован локально, uncommitted):** минимальный UX-polish составов — для клубных матчей бейдж/эмблема клуба (logo или initials fallback) вместо нейтрального флага, метка «Клубный матч/Матч сборных», `homeLogo/awayLogo` в `MatchLineupView`; без изменений логики/правил, без миграций. **D4.4/D1-B/D2** остаются для отдельного согласования.
- **Портреты/SoFIFA/списки/План B:** см. предыдущие записи; решения применялись в согласованных границах. Исторические D1–D13 — `docs/DECISIONS.md`.

## Вопросы, ожидающие моего ответа
- **Stage 4, шаг 2 (после MVP, ожидает согласования позже):** возврат к **D4.4** и уточнение клубных правил/UX линеек (разделение UI, бейджи/визуал, спец-правила бонусов/матчинга, продуктовые требования) — **реализация не разрешена до согласования**.
- **Визуал клубной карточки (опционально):** эмблема/бейдж клуба вместо нейтрального флага — по отдельному запросу/согласованию.
- **Прод/операции:** актуальность деплоя (Vercel, включает ли Stages 1–3/4), cron-job.org, состояние матчдэев/БД — требует проверки пользователем/по инфраструктуре.

## Какие действия заблокированы до согласования
- Реализация **Stage 4 шаг 2** (возврат к D4.4, расширение UX/правил/модели сверх согласованного MVP D4.1–D4.4=A) — до явного выбора подхода и границ пользователем.
- Коммиты/пуш/деплой, запись в БД/миграции сверх уже выполненных подтверждённых операций, правки lint-конфига/инфраструктуры — без отдельного согласования (если потребуется содержательный выбор).

## Блокеры и открытые вопросы
- Не подтверждено: фактическое состояние прод-БД/деплоя Vercel с учётом локальных Stage 1–3 изменений, актуальность cron-job.org, полнота env/ключей на деплое.
- Технические риски: таймауты/budget sync при росте числа comps/матчей, зависимость от sstats/лимитов, корректность alias-матчинга whitelist-only, поведение при пересечениях дат/дедупе; snapshot/БД таймауты (см. `docs/PROJECT_TRACKER.md`).
- Данные SoFIFA собраны до удаления 4 игроков и без ПСВ; при использовании потребуется актуализация/очистка соответствующих записей в `tmp/sofifa-clubs-*.json|.md`.

## Выполненные проверки и результаты
- `git status --short`, чтение ключевых файлов/структуры — выполнено.
- **Этап 1 runtime (локально, 2026-11-21):** `npx vitest run tests/unit/cards.test.ts` — **PASS** (12). `npx vitest run tests/unit/cards.test.ts tests/unit/cards-repo-helpers.test.ts` — **PASS** (19, 2 files).
- **Этап 2 runtime (локально, 2026-11-21):** `npx vitest run tests/unit/cards-grants-classification.test.ts tests/unit/cards.test.ts tests/unit/cards-repo-helpers.test.ts` — **PASS** (29, 3 files).
- **Этап 3 runtime (локально, 2026-11-21):** `npx vitest run tests/unit/cards-grants-classification.test.ts` — **PASS** (12, обновлено под Y4). `npm run test:run` — **PASS** (339 tests, 31 files).
- **Stage 4 MVP runtime (локально, 2026-11-21):** `npx tsc --noEmit --pretty false` — **ошибок в коде проекта нет** (pre-existing `tmp/fix-stats.ts` только). `npm run test:run` — **PASS** (339 tests, 31 files).
- **D1-A (локально, 2026-11-21):** `npx tsc --noEmit --pretty false` — **OK**. `npm run test:run` — **PASS** (339/339, 31 files).
- **Build (локально, 2026-11-21):** первый запуск `npm run build` — **FAIL** из-за pre-existing `tmp/fix-stats.ts` (tsconfig включал `**/*.ts`). После согласованного изменения **A** (`tmp` добавлен в `tsconfig.json` exclude) повторный `npm run build` — **PASS** (Compiled successfully, typecheck/lint-in-build OK, static pages 4/4).
- **Неуспешно/не запускалось:** `npm run lint` отдельно — **FAIL (env/tooling)**: `next lint` deprecated/интерактивная настройка ESLint (exit 1), правки не вносились. Мануальная валидация sync/грантов/клубных линеек — **не выполнялась**.
- Исторические проверки (портреты/rembg/SoFIFA/probe/План B/2C.5b–c верификация) — см. предыдущие записи.

## Известные проблемы
- См. «Технический долг / известные проблемы» в `docs/PROJECT_TRACKER.md`.
- Потенциальные точечные расхождения имён/сопоставлений (напр. `Savinho` не сопоставлен в SoFIFA) — требуют внимания при интеграции данных.
- Alias-матчинг club whitelist в sync консервативный; edge-cases имён провайдеров требуют наблюдения при реальном прогоне.

## Согласованный следующий шаг (актуально)
- **Подтверждено пользователем (2026-11-21):** вариант C, Этапы 1–3 (B на 2/3, с 3.1–3.3=A, Y4), **Stage 4 MVP (шаг 1, D4.1–D4.4=A)** и **D1-A** реализованы локально. Stage 1–4 MVP закоммичен/запушен (`18293e9`, `frontend-finish`), деплой подтверждён пользователем; **D1-A пока не коммитился/не пушился/не деплоился**.
- **Prod sync/видимость (2026-11-21, делегировано пользователем «сделай как считаешь правильным и нужным»):** `9f62a29` (hide out-of-scope + unattached-first) и `ae3bfcf` (fix tuple-in unnest) задеплоены; cron стабилен, но `Newcastle vs Arsenal` и часть валидных матчей оставались unattached из-за starvation при `50/59`. Локальный `syncFixtures()` (подтверждён пользователем) обработал 41 FD матч, sstats из локального окружения дал 404; Arsenal не прикрепился. FD по тем же ext-id перезаписал данные `565857` (`Leverkusen vs SC Paderborn`) и `560648` (`Tottenham vs Ipswich Town`) — оставлено как данные FD. `aba4065` (cap включает все unattached) задеплоен, но 50/59 pre-slice + budget break всё равно давали starvation; локальный фикс: убран pre-slice, цикл идёт по всем eligible в unattached-first порядке, остановка только по budget/deadline.
- **Следующие осмысленные шаги (без предрешения новых решений):** закоммитить/запушить/задеплоить текущий sync/alias фикс; проверить, что cron прикрепляет `Newcastle vs Arsenal` и пропущенные валидные матчи; ручная валидация клубного контура; при желании — закоммитить/запушить/задеплоить D1-A.
- **Ожидает согласования позже:** **D1-B / D2 (Stage 4 шаг 2)** — разделение UI/фильтр, спец-правила/поведение линеек. **Реализация не разрешена до согласования.**
