# Stat-Based Predictions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add randomly-mixed stat-based prediction questions (corners, cards, possession, shots on target) for UNL/sstats matches by fetching detailed match stats, storing them, and evaluating answers in app and DB.

**Architecture:** Extend the existing sync → normalized match → DB match/questions → resolve pipeline. Fetch per-match details from sstats (`/Games/{id}`) to enrich UNL matches with statistics, persist stats in `matches` columns via migration, expand question rule types/generation (`lib/data/questions.ts`), and mirror evaluation in SQL `fn_question_answer` (new migration) so `rpc_resolve_matchday` remains correct. UI keeps generic option rendering; predictions may compute provisional live correctness from current stats similarly to final evaluation.

**Tech Stack:** Next.js/TypeScript, Postgres/Supabase SQL migrations, `postgres` client, Vitest, sstats.net API.

**Spec:** `docs/superpowers/specs/2026-11-14-stat-predictions-design.md`

## Global Constraints

- Explain behavior in plain Russian in UI; no technical jargon in user-facing copy.
- Do not touch prod DB `aspnlcmsipxrhhakuckl`; no secrets printed; no paid actions or prod DB changes without explicit confirmation. Verify on a separate test copy/test data, not live prod game.
- New question types apply to matches whose questions are generated after this feature; do not rewrite already-generated or resolved matchdays.
- Question type selection must be random/varied per match from the expanded pool (mixed into regular set, not all added at once).
- Thresholds fixed: corners total over 8.5, yellow cards total over 3.5, shots on target total over 8.5.
- Evaluation logic must stay consistent between TypeScript (`answerFor`) and SQL (`fn_question_answer`).
- Keep changes consistent with existing patterns (immutability, small focused edits, existing test style).

## Review Focus

- Stats unavailable/null (match not finished, provider missing fields): question resolves/grades safely (void or null-correct as per existing behavior) without crashing sync/resolve.
- Ties for comparison questions (corners/shots on target equal): correct option matches defined option (`draw`/`поровну`) and evaluation agrees in TS and SQL.
- Possession equality edge case: defined behavior is explicit and consistent (avoid ambiguous “more”).
- Red card counting includes straight red and second-yellow dismissal if provided separately; total treated correctly.
- Sync rate limiting: per-match detail fetches are bounded/skipped appropriately so `/games/list` sync still succeeds on partial detail failures.
- Existing question types and resolved matchdays remain unaffected.

---

### Task 1: Define stat model and question rule types

**Files:**
- Modify: `lib/data/questions.ts`
- Modify: `lib/types.ts` (if MatchView/Question types need stat awareness)
- Test: `lib/data/questions.test.ts` (or adjacent existing tests)

**Interfaces:**
- Consumes: existing `QuestionRule`, `Score`, `GeneratedQuestion`, `answerFor`, `generateMatchQuestions` in `lib/data/questions.ts`.
- Produces: extended `QuestionRule` union including stat rules, extended input/score/stats shape needed by `answerFor`, and helpers for new question prompts/options. Exact rule names/params decided in implementation but must encode thresholds: corners total 8.5, yellow total 3.5, shots-on-target total 8.5.

- [ ] **Step 1: Write failing tests for new rule answer evaluation**
  - Add cases: corners total over 8.5 yes/no, corners more home/away/draw, red card yes/no, yellow total over 3.5, possession more home/away, shots on target more home/away/draw and total over 8.5, and null-stats/unknown cases.

- [ ] **Step 2: Run targeted tests to verify failures**
  - Run: `npx vitest run lib/data/questions` (or matching test file)
  - Expected: FAIL for missing rule handling/new cases.

- [ ] **Step 3: Implement rule types, option/prompt generation, and `answerFor` for stats**
  - Extend types and pure functions in `lib/data/questions.ts`. Keep functions immutable and deterministic given inputs except randomness isolated to selection (see Task 4).

- [ ] **Step 4: Run tests to verify pass**
  - Run: `npx vitest run lib/data/questions`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git add` touched files and commit: `feat: add stat-based question rules and evaluation`

### Task 2: Persist match statistics in DB and types

**Files:**
- Create: `supabase/migrations/0008_match_stats.sql`
- Modify: `lib/data/normalize.ts`
- Modify: `lib/types.ts`
- Modify: `lib/repo/season.ts` and/or mappers that read/write match rows (identify exact files)
- Modify: `lib/repo/sync.ts` (match upsert columns)

**Interfaces:**
- Consumes: existing `matches` table schema and `NormalizedMatch`/match row mapping.
- Produces: nullable stat columns/fields on matches (corners home/away, yellow cards home/away, red cards home/away, possession home/away, shots on target home/away — names consistent across TS and SQL), populated from sstats detail data; `NormalizedMatch`, DB row types, and upsert/select include them.

- [ ] **Step 1: Write/adjust failing tests for normalization/mapping of stats**
  - Add tests showing stats extracted into normalized/mapped match objects when present and null when absent.

- [ ] **Step 2: Run tests to verify failures**
  - Run relevant vitest file(s) for normalize/repo mapping.
  - Expected: FAIL.

- [ ] **Step 3: Add migration and thread stat fields through types/normalize/repo/sync upsert**
  - Create additive migration adding nullable stat columns with safe defaults (null). Update TypeScript types and SQL in `sync.ts` insert/on conflict/select as needed. Keep raw JSON stored.

- [ ] **Step 4: Run tests to verify pass**
  - Run targeted tests and `npx tsc -p tsconfig.json --noEmit --pretty false`.
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git add` and commit: `feat: store match statistics for predictions`

### Task 3: Fetch detailed sstats match stats during sync

**Files:**
- Modify: `lib/data/sstats.ts`
- Modify: `lib/repo/sync.ts`
- Test: `lib/data/sstats.test.ts` (or create)

**Interfaces:**
- Consumes: sstats `games/list` results and `/Games/{id}` (or equivalent detail endpoint) responses; `SstatsGame`/`NormalizedMatch`.
- Produces: enrichment path that fetches details for relevant sstats matches and maps `cornerKicksHome/Away`, `yellowCardsHome/Away`, `redCardsHome/Away`, possession and shots-on-target fields into normalized match stats. Must handle missing fields and per-match failures without aborting whole sync.

- [ ] **Step 1: Write failing tests for detail parsing/mapping and graceful failure**
  - Cover sample payload with stat fields and payload missing stats.

- [ ] **Step 2: Run tests to verify failures**
  - Run: `npx vitest run lib/data/sstats`
  - Expected: FAIL.

- [ ] **Step 3: Implement detail fetch + mapping with bounded requests**
  - Add function to fetch game details; enrich UNL matches in sync (prioritize live/recent/finished as appropriate) with try/catch per match so list sync remains useful. Respect existing timeout/error patterns.

- [ ] **Step 4: Run tests to verify pass**
  - Run: `npx vitest run lib/data/sstats` and `npx tsc -p tsconfig.json --noEmit --pretty false`.
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git add` and commit: `feat: fetch sstats match statistics for predictions`

### Task 4: Randomly mix new stat questions into generation

**Files:**
- Modify: `lib/data/questions.ts`
- Modify: `lib/repo/sync.ts` (generation call/seed usage if needed)
- Test: `lib/data/questions*.test.ts`

**Interfaces:**
- Consumes: expanded rule pool (existing + new stat rules) and match context.
- Produces: `generateMatchQuestions` (or updated API) that selects a random/varied mix of regular questions per match from the expanded pool including stat types, while keeping total regular count similar to current and preserving bonus exact-score behavior as specified. Randomness should be per generation (not fixed identical set for all matches) but acceptable to be seedable for tests.

- [ ] **Step 1: Write failing tests for inclusion/variety and thresholds**
  - Assert generated questions draw from pool including stat types, respect thresholds (8.5/3.5/8.5), valid options, and can vary across runs/seeds.

- [ ] **Step 2: Run tests to verify failures**
  - Run targeted vitest.
  - Expected: FAIL.

- [ ] **Step 3: Implement expanded pool and random selection**
  - Update generation logic and prompts (Russian, plain). Ensure stat questions are only meaningful when stats can be evaluated; handle via rule design.

- [ ] **Step 4: Run tests to verify pass**
  - Run targeted vitest and typecheck.
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git add` and commit: `feat: mix stat prediction questions into match generation`

### Task 5: Mirror stat evaluation in SQL resolve

**Files:**
- Create: `supabase/migrations/0009_stat_question_answer.sql`

**Interfaces:**
- Consumes: stat columns added in Task 2 and new `questions.rule` type values from Task 1/4.
- Produces: updated `public.fn_question_answer(p_rule jsonb, p_match matches)` returning correct option strings for new stat rule types, matching TypeScript `answerFor` exactly (including thresholds and tie/draw handling). Uses SECURITY/volatility settings consistent with existing function.

- [ ] **Step 1: Encode expected SQL behavior as reference cases in plan/test notes**
  - Derive cases from Task 1 tests; confirm option keys (`yes/no/home/away/draw` or equivalent) match generated options.

- [ ] **Step 2: Write migration replacing/creating function with new cases**
  - `create or replace function public.fn_question_answer ...` adding `when` branches for each new rule type; return null when required stats are null.

- [ ] **Step 3: Sanity-check SQL syntax locally (static)**
  - Run: `npx supabase --version` not required; at minimum ensure file is valid SQL text and consistent with schema. (Full DB execution requires test DB, not prod.)

- [ ] **Step 4: Run full TypeScript checks**
  - Run: `npx tsc -p tsconfig.json --noEmit --pretty false` and `npx vitest run`.
  - Expected: PASS (or pre-existing baseline).

- [ ] **Step 5: Commit**
  - `git add` and commit: `feat: evaluate stat prediction questions in resolve`

### Task 6: UI/provisional correctness and verification

**Files:**
- Modify (if needed): `app/(game)/predictions/PredictionsClient.tsx`
- Modify (if needed): `lib/game/day-state.ts`, snapshot/repo types/mappers to expose current stats for provisional evaluation
- Test: relevant UI/util tests if present

**Interfaces:**
- Consumes: questions with new kinds/rules/options and match stats (current/final).
- Produces: correct rendering of new question prompts/options (already generic) and, if implemented, provisional in-play hinting (“зашло/не зашло/ещё возможно”) based on current stats for stat questions — clearly labeled as preliminary. Final correctness remains from resolved answers.

- [ ] **Step 1: Identify minimal UI changes needed**
  - Confirm generic renderer handles new options; add provisional-status helper only if consistent with existing resolved/hit/miss display and data availability.

- [ ] **Step 2: Write failing test or add deterministic check for provisional evaluator (if added)**
  - Pure function tests preferred.

- [ ] **Step 3: Implement minimal UI/supporting logic**
  - Keep copy plain Russian; avoid claiming certainty before match final where stat can still change.

- [ ] **Step 4: Run verification**
  - Run: `npx tsc -p tsconfig.json --noEmit --pretty false` and `npx vitest run` (and `npm run build` if time permits).
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git add` and commit: `feat: show stat prediction questions in predictions`

### Task 7: Final verification and rollout notes

**Files:**
- Modify: docs/notes or plan status (optional, if repo convention exists) — no prod config changes.

- [ ] **Step 1: Run full checks**
  - Run: `npx tsc -p tsconfig.json --noEmit --pretty false`, `npx vitest run`, `npm run build`.
  - Expected: all pass.

- [ ] **Step 2: Prepare rollout notes (plain language)**
  - Document: apply migration 0008/0009 to test/prod DB only with explicit confirmation; deploy branch; stat questions appear for newly generated match questions; existing generated days unchanged; sync now fetches match details for stats.

- [ ] **Step 3: Commit any final doc updates**

## Execution Handoff

After this plan is reviewed and you confirm it captures what you want, choose execution approach: subagent-driven (task-by-task with reviews) or native (single-session implementation with final review). Recommend subagent-driven for this multi-file, DB+app consistency work.
