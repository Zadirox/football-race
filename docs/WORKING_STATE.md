# Working State

## Current goal
Board Phase 1 (Native): pack-choice cell 19 + new 41-80 mechanics (final codes 21-37), per approved spec/plan.

## Completed this session
- Task 1 (2f13753): catalog 19->choice + added 21-37; board 41-80 layout replaced 20 placeholders with 19,21-37; board tests PASS 19/19.
- Task 2 (312a35b): engine foundations - new EffectCodes (press_trap, dirty_time, broken_boot, tribune_panic, second_breath), NEGATIVE_EFFECTS extended, RollModifiers/applyRollModifiers/takeRollModifiers extended, CellChoice/PendingChoiceView extended, dice roll modifier support. Tests PASS.
- Task 3 (56306c6): cell 19 now pending pack_choice; game-tx no longer auto-grants national pack; cards disabled auto-resolves safely; choosePackChoiceAction added; GameHud pack choice modal. Engine+cards-grants PASS 54/54, tsc PASS.
- Task 4 (c76c72c): instant mechanics 24 (autogol, shieldable -3), 30 (VAR offside 60% -2/40% +2), 36 (water bottle clears negative debuffs or +2), 37 (podnozhka side effect nearest ahead -2 fallback self +1). Engine PASS 46/46.
- Task 5 (a0f5b8e): debuffs 22 press trap, 25 dirty time, 26 broken boot, 32 tribune panic (global buff_all side effect). game-tx side-effect application added (buff_all, move_all_others, move_nearest_ahead). Engine PASS 50/50.
- Task 6 (8c7bb0b): choice/risk 21 penalty, 23 dribble, 27 super_sub, 28 corner, 29 foul - engine awaiting+apply helpers, actions, GameHud modals. Engine PASS 55/55, tsc PASS.
- Task 7 (e83f80b): global/target 31 mass offside, 33 red VAR, 34 attack break, 35 meteorite, 37 podnozhka tx handling. Added move_target/random_chaos side effects, actions, GameHud target modals. Engine+board PASS 80/80, tsc PASS.

## Touched files (main)
- lib/game/catalog.ts, lib/game/board.ts, lib/game/engine.ts, lib/game/dice.ts
- lib/repo/game-tx.ts, lib/actions/game.ts
- components/map/GameHud.tsx, lib/types.ts
- tests/unit/engine.test.ts, tests/unit/board.test.ts
- docs/superpowers/specs/2026-11-22-board-phase1-pack-choice-and-new-mechanics-design.md (approved)
- docs/superpowers/plans/2026-11-22-board-phase1-pack-choice-and-new-mechanics.md

## Checks run (actual)
- `npm run test:run -- tests/unit/board.test.ts` PASS (19/19) after Task 1.
- `npm run test:run -- tests/unit/engine.test.ts` PASS (41/41, then 42/42, 46/46, 50/50, 55/55, 61/61) across tasks.
- `npm run test:run -- tests/unit/roll.test.ts tests/unit/dice.test.ts tests/unit/board.test.ts` PASS (65/65) after Task 2.
- `npm run test:run -- tests/unit/engine.test.ts tests/unit/cards-grants-classification.test.ts` PASS (54/54) after Task 3.
- `npx tsc --noEmit --pretty false` PASS after Tasks 3,5,6,7,8.
- `npm run test:run -- tests/unit/engine.test.ts tests/unit/board.test.ts tests/unit/cards.test.ts` PASS (92/92) final.

## Decisions confirmed (this session)
- 1. Mechanic 32: global debuff applies to all including self; no automatic shield spend for others. **Confirmed by user.**
- 2. Mechanic 35: random_chaos uses server-side Math.random() in tx (not roll-seed deterministic). **Confirmed by user.**
- 3. Demo-mode for new choice/risk mechanics: keep minimal refresh behavior (Option A). **Confirmed by user.**

## Not done / risks
- No DB migrations added; side effects use existing tables (season_players, active_effects, cell_events, pending_actions).
- 33/34 target selection UI is basic (list).
- Demo-mode local simulation for new mechanics is minimal by decision (A).
- Phase 2+ not implemented: mechanics 11-18 (batches 15 -> 14/16/18 -> 11/12/13/17).
- Local commits on frontend-finish, not pushed/deployed.
- Spec/plan docs are untracked: docs/superpowers/specs/2026-11-22-board-phase1-pack-choice-and-new-mechanics-design.md, docs/superpowers/plans/2026-11-22-board-phase1-pack-choice-and-new-mechanics.md.

## Next step
- Ask user to review Phase 1 results; if approved, run broader test suite as needed and prepare push/deploy decision (no push/deploy without explicit user request).
