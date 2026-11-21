# WORKING_STATE

## Current goal
- Fix stat-prediction pulling/crediting for 7 question types: `corners_more`, `shots_on_target_more`, `corners_total_over` (8.5), `red_card`, `shots_on_target_total_over` (8.5), `possession_more`, `yellow_cards_total_over` (3.5).

## What is done (this session)
- Investigated prod DB (winter-2026): many FT/LIVE matches have stat questions open/void with null stat columns and null `correct_option`. Root causes: (1) club sstats matches were not detail-enriched in sync; (2) football-data matches have no corners/cards/possession/SOT from FD and never received sstats detail stats.
- Local code fix in `lib/repo/sync.ts` (uncommitted):
  - Enrich remaining club sstats matches with `enrichSstatsMatchesWithStats` before merge.
  - Propagate stats from sstats matches to same-game football-data matches (name-normalized, 6h kickoff window) so FD stat questions get stats.
  - Backfill: resolve/grade `open/locked` FT questions when `fn_question_answer` becomes non-null; grade answers; re-resolve already-resolved matchdays that received newly-resolved questions (idempotent-ish: `score_events`/dice `ON CONFLICT DO NOTHING`; Q/resolved_at recalculated).
- Verified 4 orphaned open stat questions in already-resolved closed matchday `d0d4bb5b` (2026-11-20) have 0 answers - safe to resolve once stats arrive.

## Not done / pending
- Commit/push/deploy not done (awaiting user confirmation).
- Prod DB not remediated yet; fix takes effect on next sync after deploy.
- Need to confirm on prod that affected stat questions get stats/correct_option after sync.

## Agreed decisions
- User explicitly allowed commit/push earlier in session for UI fixes; this stat-fix is a new request - confirm before commit/push/deploy.
- Do not commit `tmp/`, `.playwright-mcp/`, `клубы/`, `сборные/`, `.env.local`.

## Open questions (awaiting agreement)
- Commit/push/deploy the `lib/repo/sync.ts` stat-fix now?

## Blockers / risks
- If no sstats donor match exists in same sync batch for an FD match, propagation won't help; sstats availability/timeouts can limit enrichment.
- Re-resolving already-resolved matchdays may not upgrade/downgrade dice tier (`ON CONFLICT DO NOTHING`) but will insert missing score_events and recalc Q/resolved_at.
- `rpc_resolve_matchday` marks FT stat questions resolved even when answer is null (existing behavior); backfill mitigates when stats arrive later.

## Checks run
- `npx tsc --noEmit --pretty false` - PASS.
- Prod DB read-only queries for stat question state - completed.

## Next safe step
- After user confirmation: commit `lib/repo/sync.ts` (+ `docs/WORKING_STATE.md`), push `frontend-finish`, deploy, trigger sync, verify affected stat questions.