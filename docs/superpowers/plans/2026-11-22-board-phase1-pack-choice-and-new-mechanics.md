# Board Phase 1 — Pack Choice + New 41–80 Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cell 19 a pending national/club pack choice and fill 41–80 with 17 new playable mechanics (no `20` placeholders), with tests and UI support.

**Architecture:** Extend the existing pure game engine (`lib/game/engine.ts`) with new `CellOutcome`/pending kinds and effect codes, keep state transitions deterministic, and apply side effects (pack grants, multi-player/global updates) in server action/tx layers (`lib/repo/game-tx.ts`, `lib/actions/*`). UI renders new pending choices through the existing GameHud/pending-action pattern.

**Tech Stack:** Next.js 15, TypeScript, Vitest, Supabase/Postgres (postgres client), existing game engine/catalog/board modules.

**Spec:** `docs/superpowers/specs/2026-11-22-board-phase1-pack-choice-and-new-mechanics-design.md`

## Global Constraints

- Do not change unrelated game behavior; keep mechanics 01-10 working.
- All randomness that affects outcomes must be server-side/deterministic through existing RNG injection patterns (`random: () => number`), never client-trusted.
- No secrets/tokens in code, tests, docs, or logs.
- New mechanics Phase 1 only: no moderated/partner/minigame flows (11–18 remain Phase 2+).
- Pack choice is pending action (`2A`) and must survive reload; idempotent resolution.
- Targeting for 43/44: active, non-finished players, excluding self.
- 42 affects everyone including the player who landed.
- 51 clears all negative debuffs.
- Do not commit/push/deploy without explicit user request for that step.

## Review Focus

- **Pending action replay/idempotency:** double-submit or reload during pack/mechanic choice should not double-grant packs or double-apply movement/effects.
- **Global/target atomicity:** mechanics 31/32/33/34/35/37 (final codes) must update all affected players in one transaction; partial updates on failure are unacceptable.
- **Shield/buff interaction regressions:** new debuffs/modifiers must not bypass existing Щитки/Жёлтая карточка/Раздевалка rules except where spec explicitly says “not shielded/voluntary risk”.
- **No-target degradation:** target mechanics with no valid target must resolve safely (defined fallback) with log, never throw/crash.
- **Board/catalog consistency:** `generateReworkedBoard`, catalog codes/names/kinds, engine switch cases, and tests must agree on final codes 19,21-37.

---

## File Structure

- Modify: `lib/game/catalog.ts` — mechanic metadata for 19 update + 21-37.
- Modify: `lib/game/engine.ts` — effect codes, outcome/pending kinds, mechanic resolution helpers.
- Modify: `lib/game/board.ts` — 41-80 fixed layout uses 19,21-37.
- Modify: `lib/repo/game-tx.ts` — pending kind persistence, pack-choice grant hook/choice resolution integration, multi-player effect application.
- Modify: `lib/actions/game.ts` and/or `lib/actions/cards.ts` — server actions for new pending choices (pack choice, target/risk choices).
- Modify: `lib/types.ts` and any pending/action schemas — pending payloads and action inputs.
- Modify: `components/map/GameHud.tsx` (+ extracted modal/component if needed) — render pack choice and new choice UIs.
- Modify tests: `tests/unit/engine.test.ts`, `tests/unit/board.test.ts`, add/modify action/repo tests as patterns allow.
- Modify docs if behavior text surfaced: `docs/WORKING_STATE.md` after implementation; spec already exists.

## Task 1: Catalog and Board Layout

**Files:**
- Modify: `lib/game/catalog.ts`
- Modify: `lib/game/board.ts`
- Test: `tests/unit/board.test.ts`

**Interfaces:**
- Produces: catalog entries for codes `19,21-37` with correct `kind/polarity/application`; `generateReworkedBoard()` returns 41-80 layout from spec with no `20`.

- [ ] **Step 1: Write failing board test for new 41-80 layout**
  Add assertions in `tests/unit/board.test.ts` (or new test block) that `generateReworkedBoard()` contains codes at 42..78 as spec table and no `mechanicCode === '20'`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:run -- tests/unit/board.test.ts`
  Expected: FAIL on old 20-heavy layout.

- [ ] **Step 3: Update catalog entries**
  In `lib/game/catalog.ts`, change `19` to `kind: 'choice', application: 'choice'` with updated description/tagline. Add 21-37 with names/rules from spec table. Keep existing 01-18 unchanged unless required.

- [ ] **Step 4: Update `generateReworkedBoard()`**
  In `lib/game/board.ts`, replace 41-80 map with spec mapping; keep 1-40 as-is.

- [ ] **Step 5: Run board tests**
  Run: `npm run test:run -- tests/unit/board.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**
  ```bash
  git add lib/game/catalog.ts lib/game/board.ts tests/unit/board.test.ts
  git commit -m "feat(board): add phase1 41-80 mechanics layout"
  ```

## Task 2: Engine Foundations for New Effects/Pending Kinds

**Files:**
- Modify: `lib/game/engine.ts`
- Modify: `lib/types.ts` (if CellChoice/Pending types are centralized)
- Test: `tests/unit/engine.test.ts`

**Interfaces:**
- Produces: extended `EffectCode`/pending choice typing to represent new buffs/debuffs and choice kinds used by 19,21,23,27,28,29,33,34. Keep `CellOutcome` shape backward-compatible where possible.

- [ ] **Step 1: Write failing tests for new effect helpers**
  Add tests for adding/spending/removing new effect codes (e.g. `press_lovushka`, `broken_boot`, `dirty_time`, `second_breath`, `tribune_panic` or chosen names). Assert `takeRollModifiers`/new modifier hook behavior as designed.

- [ ] **Step 2: Run engine tests to verify failure**
  Run: `npm run test:run -- tests/unit/engine.test.ts`
  Expected: FAIL due missing effect codes/behavior.

- [ ] **Step 3: Implement minimal type/effect support**
  Add new `EffectCode` union members and any helper logic needed. If roll modification needs extension beyond `tribuny/gazon`, add a clear hook (e.g. `takeRollModifiers` returns extra modifiers or a normalized roll adjustment function). Document exact stacking rules in code comments near logic.

- [ ] **Step 4: Run engine tests**
  Run: `npm run test:run -- tests/unit/engine.test.ts`
  Expected: PASS for new foundation tests; existing tests still green.

- [ ] **Step 5: Commit**
  ```bash
  git add lib/game/engine.ts lib/types.ts tests/unit/engine.test.ts
  git commit -m "feat(engine): add phase1 effect and pending foundations"
  ```

## Task 3: Mechanic 19 Pack Choice (Pending + Grant)

**Files:**
- Modify: `lib/game/engine.ts`
- Modify: `lib/repo/game-tx.ts`
- Modify: `lib/actions/cards.ts` or `lib/actions/game.ts`
- Modify: `components/map/GameHud.tsx` (or pending modal component)
- Test: `tests/unit/engine.test.ts` (+ action/repo test if available)

**Interfaces:**
- Consumes: active national/club pack resolvers (`lib/repo/cards.ts`).
- Produces: pending choice for 19; server action `choosePackChoice` (name can follow project conventions) that grants exactly one pack and closes pending.

- [ ] **Step 1: Write failing engine test for 19**
  Assert resolving cell `19` returns `awaiting` pack-choice kind (not instant grant), no position delta, log indicates choice required.

- [ ] **Step 2: Run engine test to verify failure**
  Run: `npm run test:run -- tests/unit/engine.test.ts`
  Expected: FAIL (currently 19 instant).

- [ ] **Step 3: Implement engine choice outcome for 19**
  Update case `19` in `resolveCell`. Remove instant grant assumption from log text.

- [ ] **Step 4: Implement pending resolution + grant**
  In tx/action layer: on pack choice resolve, validate pending belongs to current player/season, lock row, grant selected pack (`national` or `club`) with `source:'cell'`, `cellEventId`, close pending. Handle fallback rules from spec.

- [ ] **Step 5: Add GameHud choice UI**
  Render two options (Сборные/Клубы), disabled reasons when unavailable, submit action, refresh snapshot. Preserve existing pending modal patterns.

- [ ] **Step 6: Run targeted tests**
  Run: `npm run test:run -- tests/unit/engine.test.ts tests/unit/cards-grants-classification.test.ts`
  Expected: PASS (or adjust targeted set to touched tests).

- [ ] **Step 7: Commit**
  ```bash
  git add lib/game/engine.ts lib/repo/game-tx.ts lib/actions/cards.ts lib/actions/game.ts components/map/GameHud.tsx tests/unit/engine.test.ts
  git commit -m "feat(cards): make cell 19 a national-or-club pack choice"
  ```

## Task 4: Simple Instant Mechanics (24,30,36,37 discussion IDs mapped to final 24,30,36,37)

**Files:**
- Modify: `lib/game/engine.ts`
- Test: `tests/unit/engine.test.ts`

**Interfaces:**
- Produces engine cases for: Автогол (`-3`, shieldable), Проверка офсайда VAR (60% -2 / 40% +2, RNG), Бутылка с водой (clear all neg debuffs or +2), Подножка (nearest ahead -2 else +1 self).

- [ ] **Step 1: Write failing tests per mechanic**
  Cover normal case, boundary (not below 1 / first player), shield/RNG injection.

- [ ] **Step 2: Run tests to verify red**
  Run: `npm run test:run -- tests/unit/engine.test.ts`
  Expected: FAIL for new cases.

- [ ] **Step 3: Implement mechanics minimally**
  Add pure engine resolution. For Подножка target discovery, return a structured outcome requiring tx-layer application if multi-player; do not mutate other players in pure function.

- [ ] **Step 4: Run tests green**
  Run: `npm run test:run -- tests/unit/engine.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add lib/game/engine.ts tests/unit/engine.test.ts
  git commit -m "feat(engine): add phase1 instant mechanics"
  ```

## Task 5: Debuff Mechanics (22,25,26,32 mapped to final 22,25,26,32)

**Files:**
- Modify: `lib/game/engine.ts`
- Modify: `lib/game/roll.ts` or roll application path if needed
- Test: `tests/unit/engine.test.ts`

**Interfaces:**
- Produces: Прессинг-ловушка, Грязное время, Сломанный бутс, Паника на трибунах. Define how modifiers apply in roll pipeline and how Раздевалка/Щитки interact.

- [ ] **Step 1: Write failing tests for application and consumption**
  Include stacking/consumption expectations and 42-includes-self case at engine/pending outcome level.

- [ ] **Step 2: Run tests red**
  Run: `npm run test:run -- tests/unit/engine.test.ts`

- [ ] **Step 3: Implement debuff effects and roll hooks**
  Extend modifier calculation carefully; preserve existing 04/05/10 behavior.

- [ ] **Step 4: Run tests green**
  Run: `npm run test:run -- tests/unit/engine.test.ts`

- [ ] **Step 5: Commit**
  ```bash
  git add lib/game/engine.ts lib/game/roll.ts tests/unit/engine.test.ts
  git commit -m "feat(engine): add phase1 debuff mechanics"
  ```

## Task 6: Choice/Risk Mechanics (21,23,27,28,29 mapped to final 21,23,27,28,29)

**Files:**
- Modify: `lib/game/engine.ts`
- Modify: `lib/repo/game-tx.ts`
- Modify: `lib/actions/game.ts`
- Modify: `components/map/GameHud.tsx`
- Test: `tests/unit/engine.test.ts`

**Interfaces:**
- Produces pending choices and resolution actions for Пенальти, Дриблинг, Суперзамена, Угловой розыгрыш, Фол в штрафной. RNG uses server random; probabilities shown in UI.

- [ ] **Step 1: Write failing engine tests for awaiting choices and deterministic RNG outcomes**
  For each mechanic, test both options with injected random.

- [ ] **Step 2: Run tests red**
  Run: `npm run test:run -- tests/unit/engine.test.ts`

- [ ] **Step 3: Implement engine outcomes**
  Return awaiting choice kinds with payload needed by UI; no client RNG.

- [ ] **Step 4: Implement action/tx resolution**
  Add/extend choice handlers; close pending; apply movement/effects atomically.

- [ ] **Step 5: Implement GameHud UI**
  Add option cards/buttons, probability text, disabled states where applicable.

- [ ] **Step 6: Run tests green**
  Run: `npm run test:run -- tests/unit/engine.test.ts`

- [ ] **Step 7: Commit**
  ```bash
  git add lib/game/engine.ts lib/repo/game-tx.ts lib/actions/game.ts components/map/GameHud.tsx tests/unit/engine.test.ts
  git commit -m "feat(game): add phase1 choice and risk mechanics"
  ```

## Task 7: Global/Target Mechanics (31,33,34,35,37 mapped to final 31,33,34,35,37)

**Files:**
- Modify: `lib/game/engine.ts`
- Modify: `lib/repo/game-tx.ts`
- Modify: `lib/actions/game.ts`
- Modify: `components/map/GameHud.tsx`
- Test: `tests/unit/engine.test.ts`

**Interfaces:**
- Produces: Массовый офсайд, Красный VAR, Срыв атаки, Метеорит на стадионе, Подножка. Target selection uses active non-finished, excluding self where specified. All affected-player updates in one tx.

- [ ] **Step 1: Write failing tests for target/no-target/global cases**
  Include no valid target fallback, first-player fallback, random deterministic selection.

- [ ] **Step 2: Run tests red**
  Run: `npm run test:run -- tests/unit/engine.test.ts`

- [ ] **Step 3: Implement engine result contracts**
  Pure engine should return structured effect instructions (deltas/targets/buff applications) rather than mutating DB players.

- [ ] **Step 4: Implement tx-layer multi-player application**
  Lock affected rows, apply all updates, write logs/activity entries, close pending. Ensure rollback on error.

- [ ] **Step 5: Implement target choice UI where needed (33,34)**
  Show eligible targets from snapshot; disable submit when none.

- [ ] **Step 6: Run tests green**
  Run: `npm run test:run -- tests/unit/engine.test.ts`

- [ ] **Step 7: Commit**
  ```bash
  git add lib/game/engine.ts lib/repo/game-tx.ts lib/actions/game.ts components/map/GameHud.tsx tests/unit/engine.test.ts
  git commit -m "feat(game): add phase1 global and target mechanics"
  ```

## Task 8: Final Verification and Docs

**Files:**
- Modify: `docs/WORKING_STATE.md` (after implementation)
- Test: touched unit suites + typecheck

**Interfaces:**
- Produces: verified green checks, updated working state, clear remaining Phase 2+ items.

- [ ] **Step 1: Run targeted unit tests**
  Run: `npm run test:run -- tests/unit/engine.test.ts tests/unit/board.test.ts tests/unit/cards.test.ts`
  Expected: PASS.

- [ ] **Step 2: Run typecheck**
  Run: `npx tsc --noEmit --pretty false`
  Expected: PASS.

- [ ] **Step 3: Run broader tests if time/budget allows**
  Run: `npm run test:run`
  Expected: PASS or document pre-existing unrelated failures with evidence.

- [ ] **Step 4: Update `docs/WORKING_STATE.md`**
  Record completed Phase 1 scope, checks, unresolved risks, and Phase 2+ batches.

- [ ] **Step 5: Commit docs/final fixes**
  ```bash
  git add docs/WORKING_STATE.md
  git commit -m "docs: record board phase1 implementation state"
  ```

## Notes for Implementer

- `generateReworkedBoard` currently hardcodes layout; prefer editing it directly for Phase 1.
- Existing `CellChoice` is limited; extend carefully and update all exhaustive switches.
- `game-tx.ts` currently grants 19 immediately on event insert; remove that path once 19 is pending choice.
- For multi-player mechanics, keep pure engine deterministic and put DB mutations in tx layer.
- Where spec says “recommend”, treat as default unless user-approved change is needed. If a recommendation affects product behavior materially, pause and ask.