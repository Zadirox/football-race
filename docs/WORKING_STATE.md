# Working State

## Current goal
G1a guardrail + roster fix are in local code (uncommitted). A+ DB cleanup executed for 22.11 garbage matches. Awaiting decision on commit/push of G1a patch.

## Completed
- G1a fix patch (code+tests): `lib/data/club-phase.ts` (Barça alias, DOMESTIC_LEAGUE_ROSTER, G1 helpers), `lib/repo/sync.ts` (comp-aware scope check), `tests/unit/data.test.ts` (+5 tests).
- Semantics: euro cups whitelist_only keep OR; domestic whitelist_only allow both-whitelisted OR one-whitelisted+roster opponent; unknown fail-closed. Roster seeded/review-needed.
- Roster expanded with observed legit non-whitelisted opponents (RU/EN aliases) for PL/PD/BL1/SA/FL1/SLTR incl. Samsunspor/Kocaelispor.
- Verification: `vitest run tests/unit/data.test.ts` PASS (18), `tsc --noEmit` PASS, `npm run test:run` PASS (31 files, 373 tests).
- Read-only G1a-aware dry-run after roster expansion: 20.11/21.11 0 suspects; 22.11 4 true-garbage suspects.
- **A+ DB cleanup executed (user explicitly approved)** for matchday `3b6ff7bd-0cff-4b10-8f0c-a7c13f8771de` (2026-11-22, locked, not resolved, dice 0). Transaction with safety checks passed: 4 matchday_matches `in_scope=false`, 20 questions `status='void', correct_option=null` (were open/locked), `matchdays.q_total` 32->16. Matches: Juventus-Venezia SA FD `558521` (`9a5b49d1-...`), Hull-Brighton PL FD `560646` (`9c82e325-...`), Santander-Real Sociedad PD FD `564750` (`0a72e710-...`), Milan-Frosinone SA FD `558523` (`806013ff-...`). Answers remain in DB for audit.

## Decisions confirmed (user)
- C: root cause + dry-run, no DB cleanup now.
- 1B scan scope. 2C2 fix direction. G1a guardrail. A: roster-first, then targeted cleanup garbage.
- A+ cleanup executed on explicit approval ("Решай как лучше"/"пофикси уже проблему!!!").

## Not done / risks
- G1a code patch is local/uncommitted (not pushed/deployed). Until deployed, future syncs may still ingest bad matches on old code.
- 558522 Hull-Brighton FD sstats-shaped raw anomaly still in DB (in_scope false, not cleaned); G1a prevents future bad ingestion but does not repair existing rows.
- Roster is seeded/review-needed; future legit teams may be fail-closed until added.
- score_events have no `matchday_id` (use `ref_table/ref_id`); A+ avoided grading/resolve side effects by targeting open/ungraded/locked day with dice 0.

## Local workspace notes
- Branch: `frontend-finish` (ahead of origin by 1 doc commit `780d00d` at prior check).
- Dirty: `M .gitignore`, `M docs/WORKING_STATE.md`, `M lib/data/club-phase.ts`, `M lib/repo/sync.ts`, `M tests/unit/data.test.ts`, `?? .playwright-mcp/`, `?? tmp/`, `?? клубы/`, `?? сборные/`.
- DB mutation performed: A+ on 22.11 matchday `3b6ff7bd...` (4 matches soft-hidden, 20 questions voided, q_total 32->16). Script: `tmp/apply-a-plus.mjs` (tmp, not for commit).

## Next step
- Report outcome; ask user whether to commit/push G1a patch (`lib/data/club-phase.ts`, `lib/repo/sync.ts`, `tests/unit/data.test.ts`, and optionally docs). No commit/push/deploy done.
