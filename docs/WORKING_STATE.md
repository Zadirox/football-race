# Текущее рабочее состояние

Краткая актуальная сводка для продолжения работы (в т.ч. после `/compact` и в новой сессии). Расширенная история/планы/бэклог — `docs/PROJECT_TRACKER.md`. Правила агента — `AGENTS.md`.

## Текущая цель
- Стабилизировать клубный контур winter-2026: cron/sync, live счёт/минута, закрытие матчдэя, live-индикаторы в предиктах, логи Vercel. Не ломать работающее поведение. Кодовые фиксы задеплоены в `frontend-finish` (последний `78ebeaf`).

## Что сделано в этой сессии (подтверждённые факты)
- **Базовый контекст:** prod Supabase `aotjinjlhetutqfvznow`, Vercel prod `football-race-delta.vercel.app` (`zadirox1/football-race`), ветка `frontend-finish`, сезон `winter-2026` `09ffe9e4-5fb6-4f9b-9f56-505032c2c10f`. Внешний cron: cron-job.org `sync-fixtures` #8872379, Vercel Cron пустой.
- **DB-фиксы (prod, аккуратно, точечно):**
  - Como duplicate: оставлен реальный FD `558525` (`8d4e94b6-fd8a-4dc0-8d7e-9230cc742038`, Комо vs Кальяри, in_scope). Повреждённый FD `558528` (`ccf14104-021e-4762-8cf5-a8767495c68f`, фактически Lazio vs Lecce) выведен из scope/voided (0 ответов).
  - Galatasaray vs Samsunspor (`fc421bb8-a2c3-499b-92ed-8d27f7ff65ac`) исправлен вручную на `FT 2:1, 90'`, provider/manual external_id, т.к. FD `564755` маппился на другой матч (Alavés vs La Coruña); TSL не в `CLUB_COMPETITIONS`.
  - Newcastle-Arsenal дубль: sstats `4d581abd-c716-41fc-be39-d8315c39100d` (0 ответов) скрыт `in_scope=false`, questions voided, q_total пересчитан; оставлен FD `4613cd37-81f2-4742-9bb4-fd6285e6b445` (5 ответов).
  - Минуты 21.11 для LIVE/HT/FT с `minute=null` временно заполнены вычисленным fallback (real-clock diff, capped) — до прихода точной минуты от провайдера.
- **Кодовые фиксы (задеплоены):**
  - `lib/repo/sync.ts`: защита от регрессии/обнуления — не даём входящему `NS` перетирать LIVE/HT/FT статус и не обнуляем minute/score/HT на `NS`; terminal не регрессирует в NS/LIVE/HT. Fallback minute для LIVE/HT/FT при `minute=null`. Ротация club comps (`Date.now()/60s % N`) + consecutive-failure break, чтобы sstats таймауты не сжигали весь бюджет и не голодали хвосты.
  - `app/api/cron/sync-fixtures/route.ts`: `CRON_BUDGET_MS` снижен до `35000` (под типичный внешний cron timeout), catch исключений → JSON 500 с логом.
  - `app/api/cron/close-matchday/route.ts`: catch исключений → JSON 500 с логом.
  - `app/(game)/matches/MatchesClient.tsx`: 30s `router.refresh()` при LIVE/HT; статус приёма «приём закрыт» при `match.status !== 'NS'`.
  - `instrumentation.ts`: `onRequestError` подавляет только шумной stale Server Action `Failed to find Server Action...` (старые клиенты после деплоя); остальные ошибки логируются.
- **Коммиты/деплой:** `ae71771` (harden cron/sync stability, protect live scores, refresh matches), `78ebeaf` (prevent live score regression, add minute fallback, rotate club sync) — оба в `origin/frontend-finish`, Vercel prod Ready.
- **Проверки:**
  - `npx tsc --noEmit --pretty false` — OK.
  - `npm run test:run` — **31 files / 339 tests PASS** (после каждого коммита).
  - Ручной вызов prod cron с `CRON_SECRET`: `close-matchday` → `200 {"ok":true,...}`; `sync-fixtures` → `200 {"ok":true,...,"durationMs":34820,...}` (успевает в бюджет; sstats comps частично таймаутятся, но run завершается штатно с ошибками в report).
  - Prod browse: `/matches` показывает минуты/счета/статусы (Man City FT 1:1 90′, Como LIVE 2:0 122′ в момент проверки; позже Como стал FT 2:0 90′). `/predictions` показывает автообновление и live-индикаторы «сейчас: …» для score-based вопросов (проверено на Union Berlin vs RB Leipzig: «сейчас: Да», «сейчас: РБ Лейпциг», «сейчас: 1:2»).

## Статус по 7 заявленным проблемам
1. **sync-fixtures timeout / close-matchday 500** — смягчено: бюджет 35s, ротация/early-break, catch handlers. Ручные prod вызовы дают 200. В логах остаются transient DB `CONNECTION_ENDED ... pooler.supabase.com:5432` (Supavisor/инфра) — это вне кода приложения; catch делает ответ контролируемым, следующий прогон обычно ок. Нужен мониторинг cron-job.org.
2. **Счёт иногда пропадает в Матчах** — корневая причина: NS-ответ провайдера перетирал LIVE/FT данные; исправлено защитой в sync + точечный ремонт данных. Повторно не воспроизвелось после фикса.
3. **Live счёт/минута не обновляются оперативно** — 30s refresh на Matches/Predictions уже был/добавлен; sync protection + fallback minute + budget/rotation. FD не отдаёт minute — fallback вычисляет; точная минута появится если придёт от источника. Обновление ограничено частотой cron и качеством источника.
4. **В предиктах не все вопросы показывают «Пока да/нет»** — механизм работает (проверено на prod). Для stat-based вопросов (угловые/карточки/владение/удары в створ) индикатор не показывается, если в матче нет stat-данных (`answerFor` возвращает null). Это ограничение данных, не UI-баг.
5. **Vercel жёлтые логи Server Action not found** — добавлен `instrumentation.ts` `onRequestError`, фильтрующий только этот stale-client кейс. Полностью убрать невозможно для уже открытых старых вкладок/старых деплоев; новые запросы текущего деплоя не должны генерировать этот шум по той же причине.
6. **Минуты sstats-матчей** — отображение минут есть (`minute !== null ? N′ : kickoff`). Для sstats elapsed маппится в minute; для FD/live без minute добавлен fallback. Проверить на ближайшем живом sstats-матче.
7. **Проверка на prod** — выполнена: tsc/tests, ручные cron вызовы, browse Matches/Predictions, DB выборки. Остались внешние ограничения (sstats таймауты, Supavisor transient CONNECTION_ENDED, FD minute отсутствие).

## Остаточные риски/наблюдения
- **sstats нестабилен:** club comps регулярно дают timeout/не JSON; sync завершается 200, но часть comps пропускается до следующего прогона. Ротация снижает голодание, но не устраняет источник.
- **FD minute:** football-data часто не отдаёт `minute` для LIVE/FINISHED; используем fallback (оценка). Это лучше, чем скрывать минуту, но может немного отличаться от матчевых минут.
- **Supavisor CONNECTION_ENDED:** transient ошибки на pooler; в коде есть catch. Если участятся — рассмотреть Supavisor transaction mode / serverless-safe DB настройки (отдельное решение).
- **Дубликаты при расхождении имён провайдеров:** Newcastle/Arsenal вручную исправлен; общий дедуп по name overlap может не ловить EN/RU расхождения. Нужна осторожность при новых sstats/FD дублях.

## Уже согласованные решения/границы (не менять без согласования)
- Никаких коммитов/пушей/деплоев/отката чужих изменений без явного запроса; не коммитить `tmp/`, `.playwright-mcp/`, `клубы/`, `сборные/`, `.env.local`, незавершённые ассеты.
- Sync incremental/idempotent/budgeted, cron-gated `CRON_SECRET`; внешний cron cron-job.org, Vercel Cron пустой. Lineup card bonuses fully manual.
- Scope: 1 calendar date = 1 matchday; ~4 вопроса/матч; UCL все матчи; UEL/UECL и дом. лиги — матчи с хотя бы одной whitelist-командой, без мусорных лиг. 12 клубов удалены из whitelist ранее (1A/2C/3A) — не возвращать без согласования.
- UI/фронтенд задачи: использовать `impeccable`/`taste-skill` по характеру задачи (см. AGENTS.md).

## Вопросы, ожидающие ответа (блокируют реализацию соответствующей части)
- Нужен ли переход DB на Supavisor **transaction mode** / отдельный serverless-safe connection string при повторении CONNECTION_ENDED? (изменение env/infra — требует отдельного согласования).
- Нужна ли отдельная стратегия для точных минут FD-матчей (доп. источник/обогащение), или fallback-minute приемлем?
- Нужна ли нормализация/дедуп EN↔RU имён команд в sync для предотвращения дублей типа Newcastle/Ньюкасл? (затрагивает sync-логику — нужно согласование подхода).

## Обновление 2026-11-21 (дубликаты + админ клубные паки)
- **Дубликаты матчей (prod DB):** найдено 17 in_scope дублей FD↔sstats/ручной на 21–22.11 (EN/RU расхождения имён, плюс повреждённый FD external_id Hull/Brighton). Все 17 скрыты: `matchday_matches.in_scope=false`, open/locked questions voided; ответы удалены только где их было 0 (Parma/Roma sstats-дубль имел 5 ответов — answers сохранены, вопросы voided/скрыты). `q_total` пересчитан на затронутые дни.
- **Root-cause в sync:** `normalizeName` в `lib/repo/sync.ts` теперь канонизирует через `teamNameRu(...)`, чтобы EN/RU названия матчились при дедупе. Это снижает повторное появление дублей; `matchday_matches` upsert остаётся `on conflict do nothing`, поэтому скрытые вручную дубли не перевключатся в in_scope.
- **Админка паки:** добавлена выдача клубных паков как для сборных. `packGrantSchema` получил `packKind: 'national'|'club'` (default national). `grantPackToProfile` выбирает active pack (`getActiveNationalPack`/`getActiveClubPack`), пишет audit с `packKind`. UI AdminTools получил селектор типа пака и нейтральные подписи.
- **Проверки:** `npx tsc --noEmit --pretty false` — OK; `npm run test:run` — 31 files / 339 tests PASS.

## Обновление 2026-11-21 (UI карточек/пака клубов, деплой 8d35ac1)
- **Причина 1 (выглядят хуже):** `FutCard.tsx` был заточен под сборные: всегда показывал `teamFlag(nationalTeam)` и `nationalTeam` как команду. Для клубных карт (`setKind==='club'`, `clubName` есть, `nationalTeam/nationality` часто null) получались белый флаг и "Команда"/неверная команда. Исправлено: для клубов показывается `clubName` и SVG-щит (club mark) вместо флага страны; сборные без изменений.
- **Причина 2 (крутятся сборные вместо клубов):** `PackOpenReveal.tsx` для клубов использовал пул `[teamLabel, ...COUNTRY_POOL.slice(0,12)]`, поэтому в ротации появлялись страны. Исправлено: добавлен `CLUB_POOL`, для `setKind==='club'` используется только клубный пул.
- **Портреты слишком маленькие:** увеличен `portraitWrap` в `fut-card.module.css` (md/sm/lg), портрет заходит под нижнюю плашку, визуально занимает заметно больше карточки.
- **Spinazzola/сломанные фото клубов:** `/cards/clubs/napoli/leonardo-spinazzola.webp` отсутствовал в public. Проверка БД показала 127 missing club photo_url; все 127 восстановлены конвертацией из `клубы/` в `public/cards/clubs/**/*.webp` (sharp, quality 82). Источник `клубы/` не коммитился.
- **Дубли в Составах:** `lib/repo/lineups.ts` в `listLineupMatches` и `upsertLineupSlot` не фильтровал `mm.in_scope`, из-за чего скрытые дубли матчей могли попадать в Составы. Добавлен фильтр `mm.in_scope`.
- **Проверки:** `npx tsc --noEmit --pretty false` — OK; `npm run test:run` — 31 files / 339 tests PASS.

## Следующий безопасный шаг
- Задеплоить кодовые фиксы (admin pack kind + sync name canonicalization), затем проверить на prod: админка выдаёт клубный пак, новые sync прогоны не создают EN/RU дубли. Мониторить cron-job.org. При повторных CONNECTION_ENDED — согласовать infra-решение.
