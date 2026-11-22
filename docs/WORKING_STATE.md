# Working State

## Current goal
Paused after Board Phase 1. Next planned step: Phase 2 mechanics 11-18 in batches (15 -> 14/16/18 -> 11/12/13/17), after prod check of Phase 1.

## Completed
- Board Phase 1 implemented and pushed to `origin/frontend-finish` (`0989b70..bac62f2`).
- Cell 19 is pending pack choice (national/club), no auto-grant.
- Board 41-80 filled with new mechanics 21-37 (no `20` placeholders).
- Engine/actions/UI/tx support added for 21-37; side effects handled in tx.
- Full test suite PASS: `npm run test:run` (31 files, 368 tests). `tsc --noEmit` PASS.
- Spec/plan docs committed:
  - docs/superpowers/specs/2026-11-22-board-phase1-pack-choice-and-new-mechanics-design.md
  - docs/superpowers/plans/2026-11-22-board-phase1-pack-choice-and-new-mechanics.md

## Decisions confirmed (user)
- 1. Mechanic 32: global debuff applies to all including self; no automatic shield spend for others.
- 2. Mechanic 35: random_chaos uses server-side Math.random() in tx (not roll-seed deterministic).
- 3. Demo-mode for new choice/risk mechanics: minimal refresh behavior (Option A).

## Not done / risks
- Phase 2+ not implemented: mechanics 11-18 (batches 15 -> 14/16/18 -> 11/12/13/17).
- Prod deploy was auto-triggered by push; prod verification not confirmed in this session.
- 33/34 target selection UI is basic.
- Demo-mode local simulation for new mechanics is minimal by decision (A).
- No DB migrations added.

## Local workspace notes
- Branch: `frontend-finish`, synced with origin after push.
- Dirty/untracked (do not commit casually): `M .gitignore`, `?? .playwright-mcp/`, `?? tmp/`, `?? клубы/`, `?? сборные/`.

## Next step (when returning)
- Confirm Phase 1 prod deploy is healthy.
- Then start Phase 2 batch `15` per approved plan/spec direction; ask for any product clarifications before implementation where needed.
