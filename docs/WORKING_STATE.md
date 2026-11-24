# Working State

## Current goal
Внедрение новой сцены открытия пака (туннель/вступительное шоу) в игровую коллекцию по согласованному плану А. Макет собран и согласован; базовая интеграция в `PackOpenReveal` выполнена, нужна проверка в приложении и доводка. Параллельно — наблюдение за sync после чистки дублей.

## Completed
- G1a fix patch (code+tests): `lib/data/club-phase.ts` (Barça alias, DOMESTIC_LEAGUE_ROSTER, G1 helpers), `lib/repo/sync.ts` (comp-aware scope check), `tests/unit/data.test.ts` (+5 tests).
- Semantics: euro cups whitelist_only keep OR; domestic whitelist_only allow both-whitelisted OR one-whitelisted+roster opponent; unknown fail-closed. Roster seeded/review-needed.
- Roster expanded with observed legit non-whitelisted opponents (RU/EN aliases) for PL/PD/BL1/SA/FL1/SLTR incl. Samsunspor/Kocaelispor.
- Verification (G1a): `vitest run tests/unit/data.test.ts` PASS (18), `tsc --noEmit` PASS, `npm run test:run` PASS (31 files, 373 tests at that time).
- Read-only G1a-aware dry-run after roster expansion: 20.11/21.11 0 suspects; 22.11 4 true-garbage suspects.
- **A+ DB cleanup executed (user explicitly approved)** for matchday `3b6ff7bd-0cff-4b10-8f0c-a7c13f8771de` (2026-11-22, locked, not resolved, dice 0). Transaction with safety checks passed: 4 matchday_matches `in_scope=false`, 20 questions `status='void', correct_option=null` (were open/locked), `matchdays.q_total` 32->16. Matches: Juventus-Venezia SA FD `558521`, Hull-Brighton PL FD `560646`, Santander-Real Sociedad PD FD `564750`, Milan-Frosinone SA FD `558523`. Answers remain in DB for audit.
- **1B+2A1 cleanup executed (user explicitly approved "выполняй 1B+2A1")** for matchday `735e643d-4799-462f-b772-50556b2b07a8` (2026-11-21, closed, resolved). Matchday fully removed as if it did not happen; kept 6 opened pack_grants/openings/cards, 2 consumed dice + 2 rolls + 2 cell_events + Клык tribuny effect; player positions not changed. Script: `tmp/apply-1B2A1-2111.mjs` (tmp, not for commit).
- **Correction: prediction score_events for 21.11 removed (user explicitly approved "выполняй удаление очков 21.11")**. Deleted 85 orphaned score_events (82 `prediction_hit` + 3 `exact_score`, 940 pts total). Script: `tmp/del-2111-orphan-score-events.mjs` (tmp).
- **Клетки A+B, батчи 1-3 (механики 11–18) реализованы, закоммичены и отправлены**: `55db934` feat(game) batches 11-18, `a53674d` feat(admin) fan-sector review + coach contract evaluation, `9f61335` docs memory update.
- **Board layout for 11-18 in 40-80 committed/pushed** as `52fa618`; live DB updated (winter-2026, active season `09ffe9e4-5fb6-4f9b-9f56-505032c2c10f`) for 41->11,47->12,49->13,53->14,57->15,63->16,69->17,75->18 after dry-run and explicit approval.
- **Live DB 20->21-37 fix executed** (explicit approval) for 17 cells: 42->21,44->22,46->23,50->24,52->25,54->26,56->27,58->28,60->29,64->30,66->31,68->32,70->33,72->34,74->35,76->36,78->37.
- **Mechanic 20 «Проклятая бутса» implemented, committed/pushed** as `7812cc2`, placed on cell 59 in code and live DB after dry-run and explicit approval.
- **Sync duplicate investigation (2026-11-23, read-only):** found 12 duplicate team-pairs in matchday_matches (winter-2026): 5 on 24.11 (football-data+sstats, future, no answers at dry-run) and 7 on 22.11 (6 cross-provider + Hull-Brighton FD 558522/560646 anomaly). Root-cause hypothesis: sync dedup logic exists, but no protection against concurrent sync runs; overlapping cron invocations can link both provider rows.
- **Sync lock prevention committed/pushed** as `2c7e2d6` (`fix(sync): prevent concurrent sync runs with advisory lock` in `lib/repo/sync.ts`). User confirmed deploy completed.
- **Duplicate cleanup executed in live DB (2026-11-23, explicit approval "выкладка завершена, выполняй чистку дублей")**. Dry-run showed 12 pairs, 12 matchday_matches links to remove, 60 questions to delete, all discards with 0 answers/resolved/score_event_refs/other_links. Execution completed successfully. At execution time, 2 kept 24.11 copies (Будё-Глимт-ЛАСК, Галатасарай-Астон Вилла) had 5 answers each (appeared after dry-run); their discarded copies remained empty, so cleanup was safe. Scripts: `tmp/cleanup-duplicate-matches.mjs`, `tmp/check-dupes*.mjs`, `tmp/check-dupe-*.mjs`, `tmp/check-fks.mjs`, `tmp/check-tables.mjs` (tmp, not for commit).
- **Follow-up: cross-language name duplicates missed by first cleanup (2026-11-23).** User reported duplicates still visible on site. DB check confirmed exact-name dupes were gone but 5 fuzzy pairs remained (different RU/EN spellings): 22.11 Santander/Расинг Сантандер-Реал Сосьедад; 24.11 Arsenal-Боруссия Дортмунд, Como-AEK Athens, Real Madrid-PSV Eindhoven, Sl. Bratislava-Реал Бетис. Dry-run showed 5 links, 25 questions, all discards safe (0 answers/resolved/score_event_refs/other_links). **Executed on explicit approval "выполняй чистку этих 5 дублей"**. Script: `tmp/cleanup-duplicate-matches-fuzzy.mjs` (tmp).
- Verification (latest code changes in this session): `npm run typecheck` PASS after sync lock patch.
- **Pack opening mockup (tmp, not committed):** `tmp/concept-a-luxe.html` iterated to agreed concept — winter luxe tunnel, 1A choreography, 1B lock signal, 2A intro show, timing A then B (+2s club spin). Sounds in `tmp/sounds/`, crests in `public/crests/` (24 clubs, bg removed except roma).
- **Pack opening implemented in game (Plan A, no commit/push/deploy):** `components/cards/PackOpenReveal.tsx` rewritten to tunnel intro flow; preserves props/skip/close/FutCard/collectionComplete; supports club+national packs; uses crests/flags, player photos, bg+reveal sound files. `app/(game)/collection/CollectionClient.tsx` passes `poolCards`. Sound assets copied to `public/sounds/packs/` (untracked). `npx tsc --noEmit` PASS.

## Decisions confirmed (user)
- 2026-11-23, клетки A+B: выбран вариант A; A батчами 15 → 14/16/18 → 11/12/13/17. Размещение 11–18 на живой карте — после отдельного согласования; затем пользователь согласовал размещение и живые DB-обновления.
- 2026-11-23, пользователь делегировал важные решения в рамках A+B и «что дальше» (не отменяет запреты на коммит/пуш/деплой/DB-мутации без явного отдельного разрешения).
- 2026-11-23, механика 20 «Проклятая бутса» согласована: попадание даёт 1 заряд на следующий бросок; бросок считается обычным, но движение получает случайный активный не финишировавший соперник, игрок остаётся на месте; если соперников нет при попадании/срабатывании — +1 клетка; доп. движение не запускает клетку; Щитки не защищают; эффект одноразовый и снимаемый как негативный. Размещение на клетку 59 — вариант A, согласовано.
- 2026-11-23, дубли матчей: выбран вариант **C** (сначала защита в коде, выкладка, затем чистка базы). Внутри C согласованы: **1A** — блокировка параллельных sync-запусков; **2A** — чистка с сохранением копии с ответами/засчитанными вопросами для сыгранных, для будущих 24.11 оставить одну копию и убрать пустую. Явные подтверждения получены: «A» (фиксировать/отправить защиту), «выкладка завершена, выполняй чистку дублей», «выполняй чистку этих 5 дублей» (доп. чистка 5 пар с разными RU/EN названиями, пропущенных первой проверкой).
- 2026-11-24, открытие пака: согласован концепт макета (A luxe winter, tunnel, mockup-only), 1A хореография, 1B яркий сигнал фиксации, 2A вступительное шоу, тайминг A, затем B (+2с клуб, итог ~29.5с). Согласован план **B->A внедрения**: вариант А — полная замена сцены открытия в игре с сохранением поведения/очереди/пропуска/финальной карточки/клубных и сборных паков; коммит/пуш/деплой — только после отдельных подтверждений.

## Not done / risks
- G1a code patch is local/uncommitted (not pushed/deployed). Until deployed, future syncs may still ingest bad matches on old code.
- Sync advisory lock lowers race risk but does not add a DB-level uniqueness guarantee for logical same-match duplicates; monitor future sync runs. Also, cross-language name variants (RU/EN) can bypass exact-name checks; any future duplicate audit should include fuzzy/teamNameRu-aware matching.
- 558522 Hull-Brighton FD sstats-shaped raw anomaly was cleaned as part of 22.11 duplicate cleanup (discarded NS/in_scope false copy); the remaining 560646 is the kept FT answered copy. Verify no UI/reporting side effects.
- Roster is seeded/review-needed; future legit teams may be fail-closed until added.
- Demo-mode for multi-step/partner flows is simplified and does not simulate full two-user secret choices.
- Remaining fidelity/content gaps: 11 — server-random 3 shots (not pointer/skill minigame); 12 — built-in riddle pool + auto-compare (no admin content workflow/manual review).
- score_events have no `matchday_id` (use `ref_table/ref_id`).
- Temp scripts in `tmp/` and untracked asset folders `.playwright-mcp/`, `клубы/`, `сборные/` remain uncommitted; do not commit without separate decision.

## Local workspace notes
- Branch: `frontend-finish`.
- Working tree currently clean of tracked code changes; untracked: `.playwright-mcp/`, `tmp/`, `клубы/`, `сборные/`.
- DB mutations with explicit approvals in this project history include: A+ 22.11; 1B+2A1 21.11 + orphaned prediction score_events removal; live board updates for 11-18 placement, 20->21-37 fix, cell 59->20; duplicate match cleanup 22.11/24.11.

## Next step
- Проверить в приложении новую сцену открытия пака (клубный/сборный пак, очередь нескольких карт, пропуск, завершение, звук/громкость, мобильный вид). Довести по результатам QA.
- После проверки отдельно решить: коммит/пуш/деплой изменений открытия пака и добавленных звуковых ассетов `public/sounds/packs/`.
- Наблюдать следующие прогоны sync/cron после выкладки блокировки: убедиться, что новые дубли не появляются в «Матчах» и «Предиктах».
- Отдельно решить судьбу локального G1a guardrail patch (коммит/пуш/деплой) и временных `tmp/` скриптов.