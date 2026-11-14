# Day Results UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show clear, shareable outcomes after a matchday is resolved: per-question correctness/distribution, the player’s day summary and awarded die, and a per-day results table.

**Architecture:** Build on the existing resolve flow (`rpc_resolve_matchday` in SQL, `close-matchday` cron) and the single season snapshot (`lib/repo/season.ts` → `SeasonSnapshot`). Add a small “matchday result” read model (per-player, per-matchday: answered/correct/bonus/die tier) sourced from existing `answers`, `questions`, and `dice` rows, expose it in the snapshot and/or a focused query, then surface it in Predictions and Ratings. Keep resolve idempotent and avoid rewriting already-resolved/old matchdays.

**Tech Stack:** Next.js 15 (App Router, React 19), TypeScript, Supabase/Postgres (`postgres` client, SQL migrations), Vitest, existing UI primitives in `app/(game)` and `components/`.

**Spec:** Product request from conversation (2026-11-14): improvements 1,3,4,5 — (1) personal “Итоги дня” summary, (3) per-day results table/leaderboard, (4) answer distribution per question, (5) explicit “кубик получен” indication. (Former item 2 — per-player/day results in “Комментатор” feed — intentionally removed as redundant with 1 and 3.)

## Global Constraints

- **Production safety:** prod DB is Supabase `aotjinjlhetutqfvznow` only. Never touch `aspnlcmsipxrhhakuckl`. Do not apply migrations or make prod data changes without explicit user confirmation. Do not print secrets.
- **Resolve rules (current):** on resolve, all active participants receive a day die (0 correct → `wood`, better → better tier; exact-score bonus still grants extra as today). `rpc_resolve_matchday` is idempotent (no-op if `resolved_at` set). Keep dice/results for already-resolved days unchanged.
- **Timezone/game-day:** game-day window and 09:00 MSK boundary logic live in `lib/game/day-state.ts` / `lib/time.ts` / cron behavior — do not regress day boundaries.
- **UI language/copy:** Russian, clear and player-facing (existing tone in Predictions/Rules/Feed).
- **No paid/external side effects** beyond existing data sources; no push notifications (out of scope per prior spec).
- **TDD & repo rules:** tests before/with implementation for logic; `npx tsc -p tsconfig.json --noEmit --pretty false` and `npx vitest run` green; follow existing naming/style and immutability patterns.

## Review Focus

- **Day with 0 resolved questions (`q_total = 0`):** UI and queries must not divide by zero or claim a winner; show a neutral “нет итогов/вопросов не было” state.
- **Not-yet-final matches / unclosed day:** before resolve completes, distribution/correctness/die must not appear as final; rely on existing `question.status`/`matchday.status` gates (distribution/correct hidden while `open`).
- **Viewer roles:** spectators/guests and non-participants must not see “your die awarded” as if they played; per-day results must not leak private data beyond what’s already public (nicknames/positions/results are public in this game).
- **Demo mode (`snapshot.demo`):** features driven by DB rows must degrade gracefully or have a deterministic demo equivalent so `/predictions`, ratings, and map don’t crash without `DATABASE_URL`.

---

## Data model: per-player matchday result

Define a single shape reused by UI (1,3,5):

```ts
export type MatchdayResultView = {
  matchdayId: string;
  gameDate: string;        // ISO date
  profileId: string;
  nickname: string;
  answered: number;        // regular questions answered
  correct: number;         // regular correct
  total: number;           // q_total / resolved regular count
  bonusHit: boolean;
  dieTier: 'wood' | 'bronze' | 'silver' | 'gold' | null; // day die; null if no award (e.g. q_total 0)
  rank?: number;           // 1-based for the day, by correct desc, tiebreakers defined
};
```

Derivation (no new source of truth required): `answers` + `questions` (resolved, `is_bonus` flag) + `dice` (`source='matchday'`, `matchday_id`) joined to `matchdays`/`season_players`/`profiles`. Prefer a read helper (SQL view/function or `lib/repo` query) over duplicating logic in multiple places.

### Task 1: Matchday results read model and query

**Files:**
- Create: `lib/repo/matchday-results.ts`
- Modify: `lib/types.ts`
- Test: `tests/unit/matchday-results.test.ts` (pure mapping/format helpers) and/or `tests/unit/mappers.test.ts` if mapping added

- [ ] **Step 1: Write failing tests** for a pure helper that maps DB rows → `MatchdayResultView[]` and computes day rank/tiebreakers (e.g. correct desc, accuracy desc, answered desc, nickname asc) and handles `total === 0`.
- [ ] **Step 2: Run tests to verify RED**: `npx vitest run tests/unit/matchday-results.test.ts -v` (expect fail/missing).
- [ ] **Step 3: Implement types + mapper + query**
  - Add `MatchdayResultView` to `lib/types.ts`.
  - In `lib/repo/matchday-results.ts` export:
    - `mapMatchdayResultRows(rows): MatchdayResultView[]` (pure)
    - `loadMatchdayResults(seasonId, matchdayId): Promise<MatchdayResultView[]>` (DB; skip/empty when `!hasDatabase()`)
    - `loadLatestClosedMatchdayResultsForViewer(seasonId, profileId): Promise<{ day: MatchdayView; mine: MatchdayResultView; top: MatchdayResultView[] } | null>` for (1) and “top of day” context.
  - Rank only when `total > 0`; define deterministic tiebreakers in code and document in a comment.
- [ ] **Step 4: Run tests to verify GREEN**.
- [ ] **Step 5: Commit**: `feat: add matchday results read model`

**Notes:** Keep query scoped to a single matchday/season; use existing `db()`/`postgres` patterns from `lib/repo/season.ts`. Do not mutate state.

### Task 2: Expose results in the season snapshot (targeted)

**Files:**
- Modify: `lib/repo/season.ts`, `lib/types.ts`
- Modify: `lib/demo/snapshot.ts` (demo equivalents)
- Test: `tests/unit/demo.test.ts` and/or mapper/snapshot-shape tests as present

- [ ] **Step 1: Write failing tests** asserting the snapshot carries the data needed for (1),(5): e.g. `myLastClosedDayResult` (nullable) and/or `lastClosedMatchday` summary for the viewer, and that demo snapshot provides a deterministic closed-day example with die tier.
- [ ] **Step 2: Run tests to verify RED**.
- [ ] **Step 3: Extend `SeasonSnapshot` minimally**
  - Add e.g. `myLastClosedDayResult: (MatchdayResultView & { matchday: MatchdayView }) | null` and optionally `lastClosedDayTop: MatchdayResultView[]` (small, e.g. top 3) — enough for (1) and a feed highlight, without bloating every render.
  - In `loadFromDatabase`, resolve “latest closed matchday for this season” and, if viewer is a player, load their result (+ top N) via Task 1 helpers. In demo, synthesize from demo questions/choices so (1)(4)(5) are visible.
- [ ] **Step 4: Run tests to verify GREEN**.
- [ ] **Step 5: Commit**: `feat: include closed matchday result in snapshot`

---

## UI improvements

### Task 3: (4) Show answer distribution per question

**Files:**
- Modify: `app/(game)/predictions/PredictionsClient.tsx`
- Modify: `app/globals.css` (if a small bar/percentage style is needed)
- Test: `tests/unit/...` for any extracted pure formatter (e.g. percent/total helpers); manual/Playwright smoke optional

- [ ] **Step 1: Write failing tests** for a pure helper `distributionForRender(question, optionKey)` / percent calculation that handles null, zero-total, and rounding to whole % summing sensibly.
- [ ] **Step 2: Run tests to verify RED**.
- [ ] **Step 3: Render distribution in Predictions**
  - `QuestionView.distribution` is already loaded for non-open questions (`lib/repo/season.ts`); in `PredictionsClient`, when `question.distribution` is present, show per-option counts/percentages (and/or a compact bar) under/inside each option or below the options.
  - Keep correct/selected highlighting intact; ensure labels remain readable on mobile; hide distribution while `status === 'open'` (data is already null).
- [ ] **Step 4: Run tests to verify GREEN**.
- [ ] **Step 5: Commit**: `feat: show answer distribution on resolved questions`

### Task 4: (5) Explicit “die awarded” indication

**Files:**
- Modify: `app/(game)/predictions/PredictionsClient.tsx`
- Modify: `components/map/GameHud.tsx` (only if highlighting newly available dice is desired)
- Test: unit tests for a small label helper `dieLabel(tier)` if introduced

- [ ] **Step 1: Write failing tests** for die-tier → Russian label/description mapping (covers wood/bronze/silver/gold/null).
- [ ] **Step 2: Run tests to verify RED**.
- [ ] **Step 3: Surface the award**
  - In Predictions, when the viewed day is closed/resolved for the player and `myLastClosedDayResult` (or equivalent) matches that day, show a clear line/chip: e.g. «Кубик за день: серебряный (получен)» plus `угадано X из Y`.
  - If feasible without noise, briefly distinguish “новый кубик за этот день” vs “уже в наборе” (e.g. compare dice totals or a `matchdayId`-scoped flag); otherwise a clear static award line for the closed day is sufficient.
- [ ] **Step 4: Run tests to verify GREEN**.
- [ ] **Step 5: Commit**: `feat: show awarded day die in predictions`

### Task 5: (1) Personal “Итоги дня” summary card/modal

**Files:**
- Create: `components/game/DayResultsSummary.tsx` (client)
- Modify: `app/(game)/layout.tsx` or `components/map/GameHud.tsx` / `app/(game)/predictions/page.tsx` (mount point)
- Test: unit test for “should show” logic (given result + dismissed id) if extracted

- [ ] **Step 1: Write failing tests** for dismissal logic: show when `myLastClosedDayResult.matchdayId` exists and not equal to stored dismissed id for this profile/season; hide otherwise.
- [ ] **Step 2: Run tests to verify RED**.
- [ ] **Step 3: Implement summary UI**
  - Render: game date, correct/total (+percent), bonus hit yes/no, die tier awarded, short link/button to Predictions and to Ratings (day view if Task 6 done).
  - Persist dismissal in `localStorage` keyed by season/profile/matchday (e.g. `fr.dayResultsSeen.<season>.<profile>=<matchdayId>`), same spirit as onboarding flags; “Показать снова” not required.
  - Mount so a participant sees it once on entry after resolve (e.g. in game layout/HUD overlay). Do not show for spectators/guests or when no result.
- [ ] **Step 4: Run tests to verify GREEN**.
- [ ] **Step 5: Commit**: `feat: add personal day results summary`

### Task 6: (3) Per-day results table (leaderboard for the day)

**Files:**
- Modify: `app/(game)/ratings/page.tsx`, `app/(game)/ratings/RatingsClient.tsx`
- Modify: `lib/repo/matchday-results.ts` (list recent closed matchdays / by id)
- Modify: `lib/types.ts` if a ratings payload type is added
- Test: unit tests for day-rank formatting/sorting helper (reuse Task 1)

- [ ] **Step 1: Write failing tests** for selecting a specific closed matchday and ordering rows (including `total===0` → unranked/neutral).
- [ ] **Step 2: Run tests to verify RED**.
- [ ] **Step 3: Add “За день” view**
  - In Ratings, add a mode/tab or selector: choose a closed matchday (default latest closed) and show table columns: rank, participant, correct, total/answered, accuracy %, die tier.
  - Data: `loadMatchdayResults(seasonId, matchdayId)` for all active players; highlight `me`.
  - Keep existing season modes (distance/points/accuracy) intact.
- [ ] **Step 4: Run tests to verify GREEN**.
- [ ] **Step 5: Commit**: `feat: add per-day results leaderboard`

## Verification & rollout (when implementing)

- [ ] `npx tsc -p tsconfig.json --noEmit --pretty false`
- [ ] `npx vitest run`
- [ ] Manual: demo mode shows (1),(4),(5) for a closed day; real DB path shows distribution after lock/resolve and day table (3).
- [ ] Deploy code to prod when ready (no new DB migrations in this plan).

## Suggested implementation order (value/effort)

1. **Task 3 (4, distribution)** — data already in snapshot; pure UI win.
2. **Task 1 + Task 2** — shared results read model for 1,3,5.
3. **Task 4 (5, die label)** and **Task 5 (1, summary)** — immediate player clarity.
4. **Task 6 (3, per-day table)** — comparison/“кто больше угадал”.

## Out of scope for this plan

- Push/email notifications, PWA alerts.
- Admin UI to edit questions or manually override per-user results.
- Rewriting or recomputing already-awarded dice/results for historical closed matchdays (beyond what idempotent resolve already guarantees).
- Changing core scoring/die thresholds (only surfacing and explaining outcomes).
- Per-player/day result messages in the “Комментатор” activity feed (removed by decision; per-day table + personal summary cover this need).
