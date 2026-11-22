# Board Phase 1 — Pack Choice + New 41–80 Mechanics (Design)

**Date:** 2026-11-22  
**Status:** Draft for approval  
**Scope:** Phase 1 of “cells after 40” work (agreed C). Phase 2+ covers mechanics 11–18.

## Intent / Why

- Make cell `19` “Пак на выбор” actually let the player choose **National pack** or **Club pack**.
- Fill board cells 41–80 with new, interesting mechanics (debuff/risk/chaos-heavy), replacing most `20` placeholders.
- Keep changes implementable now (no moderated/partner/minigame flows), while preserving a clear path to implement 11–18 later.

## Agreed Decisions (user-confirmed)

- **Phasing:** `1C` — phased. Phase 1 now; 11–18 implemented in later batches.
- **Pack choice UX:** `2A` — pending action choice (survives reload, consistent with engine).
- **11–18:** must be implemented eventually. Batching order: `15`, then `14/16/18`, then `11/12/13/17`.
- **41–80 layout strategy:** `A` — no reserved placeholders now; fully playable layout in Phase 1. When 11–18 land, revise layout in a separate agreed change.
- **New mechanics selected:** 21,22,24,26,28,29,32,35,36,38,40,42,43,44,48,51,52 (discussion IDs below). Mechanic 46 removed.
- **Targeting (43,44):** active, non-finished players, excluding self.
- **42 Паника на трибунах:** applies to everyone including the player who landed.
- **51 Бутылка с водой:** clears all negative debuffs.
- **User delegated:** fallback behavior when cards disabled / pack unavailable — agent picks best reasonable behavior (documented below).

## Goals

- Cell 19 creates a pending choice and grants selected pack type.
- 41–80 has no `20` placeholders (except none; 48/62 remain 19).
- Add selected new mechanics to catalog, engine, game-tx/pending handling, UI, and tests.
- Keep board deterministic (`generateReworkedBoard` fixed map).

## Non-goals (Phase 1)

- Implementing mechanics 11–18.
- Partner/moderated/minigame frameworks.
- Board generation algorithm changes beyond editing the fixed reworked layout.
- New card art/3D/FX polish beyond normal UI needed for choices.

## Fallback (delegated decision, agent call)

- If `cardsEnabled=false`: resolve 19 with no pack, log “Карточки выключены”.
- If chosen pack kind has no active pack: show disabled option with reason; if only one kind available allow choosing it; if none available auto-resolve with no pack and clear log.
- Never silently grant wrong pack kind.

## Pack Choice (Mechanic 19) Design

- **Catalog:** change 19 from `instant` to `choice`, application `choice`.
- **Engine:** landing on 19 returns outcome with `awaiting: 'pack_choice'` (or `19`-specific pending kind) and no movement.
- **Pending action payload:** `{ options: ['national','club'], cellEventId }` or minimal payload; source of truth is cell event.
- **Action:** new action `choosePackChoice({ pendingActionId, packKind: 'national'|'club' })` in `lib/actions/cards.ts` or `lib/actions/game.ts` (pick location consistent with existing patterns; prefer cards/game boundary by existing architecture).
- **Grant:** use existing grant helpers; national -> active national pack, club -> active club pack (`a002`/active club pack resolver). Record `source='cell'`, `cellEventId`.
- **UI:** GameHud renders choice modal when pending kind is pack choice; two clear options, disabled state/reason where needed. Uses existing modal styling conventions.
- **Idempotency:** pending action closed in same transaction as grant; re-submitting closed action returns safe error.

## Selected New Mechanics (Phase 1)

Final codes should be contiguous in catalog; mapping from discussion IDs:

| Final code | Discussion ID | Name | Type | Rule |
|---:|---:|---|---|---|
| 21 | 21 | Пенальти | choice+risk | Бить: 70% `+3`, 30% `0`. Пас: `+1`. Вероятности до выбора. Промах не щиткуется. |
| 22 | 22 | Прессинг-ловушка | debuff | Следующий бросок `-2` (мин 1), 1 бросок. Щитки блокируют получение, Раздевалка снимает. |
| 23 | 24 | Дриблинг | choice+risk | Обыграть: 60% `+2`, 40% `-1`. Сбросить: `+1`. Риск до выбора, плохой исход не щиткуется. |
| 24 | 26 | Автогол | instant negative | `-3` клетки, не ниже 1. Новая клетка не срабатывает. Щитки блокируют. |
| 25 | 28 | Грязное время | debuff | Следующий бросок: если выпало 4+, считать как 3. 1 бросок. Щитки блокируют, Раздевалка снимает. |
| 26 | 29 | Сломанный бутс | debuff | Следующие 2 броска `-1` (мин 1). Щитки блокируют получение, Раздевалка снимает (весь эффект). |
| 27 | 32 | Суперзамена | choice | Выбор: `+2` к следующему броску (1 бросок) ИЛИ получить Щиток 1 заряд. Если Щиток уже есть — вместо Щитка `+1` клетка. |
| 28 | 35 | Угловой розыгрыш | choice+risk | Простой: `+1`. Розыгрыш: 50% `+3`, 50% `-1`. Риск до выбора. |
| 29 | 36 | Фол в штрафной | choice+risk | Защититься: `-1`. Спорить: 50% ничего, 50% `-3`. Щитки не спасают от выбора спорить. |
| 30 | 38 | Проверка офсайда VAR | instant mixed | 60% `-2`, 40% `+2`. RNG серверный, логируется. |
| 31 | 40 | Массовый офсайд | instant global | Все остальные активные не-финишировавшие `-2` (не ниже 1). Новые клетки не срабатывают. Щитки не применяются к чужому глобальному эффекту (confirm in impl; recommend no individual shield spend). |
| 32 | 42 | Паника на трибунах | global debuff | Всем игрокам, включая наступившего, следующий бросок `-1` на 1 заряд. Щитки/ЖК взаимодействие по обычным правилам при получении дебаффа? (define in impl). |
| 33 | 43 | Красный VAR | choice+risk target | Выбрать активного не-финишировавшего соперника: 50% цель `-3`, 50% ты `-2`. Новые клетки не срабатывают. |
| 34 | 44 | Срыв атаки | choice target | Выбрать активного не-финишировавшего соперника впереди: цель `-2`. Если впереди никого — `+1` себе. |
| 35 | 48 | Метеорит на стадионе | instant global RNG | Случайный активный не-финишировавший получает `-3`, другой случайный `+2`; может попасть на наступившего. Если игроков мало — деградировать безопасно. |
| 36 | 51 | Бутылка с водой | instant recovery | Снять все негативные дебаффы. Если нечего снимать — `+2` клетки. |
| 37 | 52 | Подножка | instant target auto | Ближайший игрок впереди получает `-2` (не ниже 1). Если ты первый — `+1` себе. Новая клетка не срабатывает. |

> Note: Final contiguous numbering is an implementation simplification; discussion IDs kept for traceability. Before coding, confirm no conflicts with future reserved codes and update catalog/board/tests consistently.

## 41–80 Layout (Phase 1 draft, approved)

Event slots (19 total): 42,44,46,48,50,52,54,56,58,60,62,64,66,68,70,72,74,76,78

| Cell | Final code | Name |
|---:|---:|---|
| 42 | 21 | Пенальти |
| 44 | 22 | Прессинг-ловушка |
| 46 | 23 | Дриблинг |
| 48 | 19 | Пак на выбор |
| 50 | 24 | Автогол |
| 52 | 25 | Грязное время |
| 54 | 26 | Сломанный бутс |
| 56 | 27 | Суперзамена |
| 58 | 28 | Угловой розыгрыш |
| 60 | 29 | Фол в штрафной |
| 62 | 19 | Пак на выбор |
| 64 | 30 | Проверка офсайда VAR |
| 66 | 31 | Массовый офсайд |
| 68 | 32 | Паника на трибунах |
| 70 | 33 | Красный VAR |
| 72 | 34 | Срыв атаки |
| 74 | 35 | Метеорит на стадионе |
| 76 | 36 | Бутылка с водой |
| 78 | 37 | Подножка |

All other 41–80 cells remain plain/start/finish as before; no `20` placeholders.

## Key Implementation Areas

- `lib/game/catalog.ts` — add 21-37, update 19 kind.
- `lib/game/engine.ts` — implement new mechanics; 19 becomes awaiting choice.
- `lib/game/board.ts` — update `generateReworkedBoard`.
- `lib/repo/game-tx.ts` — pack choice grant on choice resolution; global/target effects application.
- `lib/actions/game.ts` / `lib/actions/cards.ts` — choice actions, validation.
- `components/map/GameHud.tsx` (and related modals) — pending choice UI for 19 and new choices.
- `lib/types.ts` / schemas — pending payloads, action inputs.
- Tests: engine unit tests, board tests, action/repo tests where present.

## Risks / Open Technical Details (resolve during implementation, escalate if product-significant)

- **Shield interaction for global effects (31,32,35,37 target others):** recommend no automatic spending of other players' shields unless explicitly designed; document clearly.
- **46 removed but similar ideas may return:** no impact.
- **Effect stacking:** 22/26/32 style roll modifiers need clear stacking rules with 04/05/10. Recommend same pattern as existing Gazoon/Трибуны where possible.
- **Targeting when no valid targets:** degrade safely (`+1` self or no-op with log), never crash.
- **Pending action schema:** reuse existing pending_actions kinds/payload conventions.
- **Cards disabled for one kind only:** UI must show unavailable option disabled.

## Acceptance Criteria

- Landing on 14/26/48/62 creates pack-choice pending; player can pick national or club; correct pack granted; reload keeps pending.
- 41–80 has no `20` placeholders; selected mechanics trigger with correct logs/state changes.
- Global/target mechanics update all affected players atomically and write logs.
- Existing mechanics 01-10 and 19 board positions outside 41-80 remain correct.
- Tests/build pass for touched areas.

## Phase 2+ (not in this doc)

- Implement 11–18 in agreed batches: `15`, then `14/16/18`, then `11/12/13/17`.
- Revisit 41–80 layout after each batch as needed (separate agreement).