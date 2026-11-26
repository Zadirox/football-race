# Card Points Batch Submit + Lineup Autosave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-card admin bonus actions with a day-filtered batch submit that creates player-visible card-points reports, and replace per-slot lineup save waits with background autosave.

**Architecture:** Add a dedicated card-points report model (report header + player report items + seen state) written atomically by a new admin batch-submit repo transaction; expose player history via server action/repo query and render it in a persistent header badge + modal mounted in game layout. Keep bonus scoring truth in `lineup_card_results` + `score_events(kind='lineup_bonus')`. For lineups, keep existing slot validation repo logic but move client to optimistic autosave with per-slot request serialization and no blocking refresh.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Supabase/Postgres (`postgres` client + SQL migrations), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-card-points-batch-and-lineup-autosave-design.md`

## Global Constraints

- AGENTS: no commit/push/deploy/DB mutation without explicit separate user approval. Plan commit steps are instructions for executor; do not execute commits unless user explicitly approves.
- Do not touch unrelated dirty/untracked files (`tmp/`, `.playwright-mcp/`, `клубы/`, `сборные/`, existing unrelated modified docs/tests/board files) unless user explicitly asks.
- When asking user to choose variants, use plain Russian with no code/technical project names (AGENTS rule). Design/spec decisions already approved; do not re-open without new substantial ambiguity.
- Bonus points are `LINEUP_POINTS` by rarity (`common=10, rare=20, epic=30, legend=40`), score event kind `lineup_bonus`, ref `lineup_slot`.
- Active admin queue = unprocessed visible items; checkboxes default empty; batch submit affects only active visible items in current filter (spec decisions 2,6).
- Return to queue does not clear old award before resubmit; correction creates player-visible history entry on changed result (decision 7).
- Player history shows awarded cards only; pre-feature historical awards included as historical records (decision 8).
- New player modal auto-opens once on next visit/refresh on any game page when unseen results exist; closing marks shown new results seen; history always accessible from header badge (decision 9).
- Preserve demo/no-DB safe behavior and existing auth/role guards.

## Review Focus

1. **Batch submit with mixed old state** — admin submits visible active slots where some were previously awarded and are unchecked now; expected: points removed, no duplicate score events, report records correction, hidden filtered slots unchanged.
2. **Double submit / retry** — same decision submitted twice or retried after client uncertainty; expected: idempotent final DB state, no double points, no duplicate confusing reports beyond defined behavior.
3. **Return to queue then resubmit** — returned slot keeps old points until new submit; new submit applies decision and creates correction history; expected: no temporary point loss on return.
4. **Player history visibility** — player with zero new reports opens badge; player with old pre-feature awards opens history; expected: awarded-only history, historical entries visible, no 0-point rows shown.
5. **Lineup autosave races** — user changes same slot quickly A->B->A or edits multiple slots; expected: last confirmed server state wins, no stale response overwriting newer selection, clear error rollback.

---

## File Structure

### Create
- `supabase/migrations/0017_card_bonus_reports.sql` — report header/items/seen schema, indexes, RLS grants/policies as needed.
- `lib/repo/card-bonus-reports.ts` — create/list/mark-seen report repo functions; historical backfill/read model helpers.
- `lib/actions/card-bonus-reports.ts` — player read/seen server actions.
- `components/cards/CardBonusReportsModal.tsx` — reusable big modal for admin summary/player history.
- `components/cards/CardBonusReportsBadge.tsx` — header badge/button + client fetch/open state.
- `tests/unit/card-bonus-batch.test.ts` — pure/logic tests for batch decision mapping and report shaping.
- `tests/unit/card-bonus-reports.test.ts` — repo/action shaping tests with mocked DB where practical.

### Modify
- `lib/actions/admin-schemas.ts` — add batch submit schema, return-to-queue schema update/reuse.
- `lib/actions/admin.ts` — add `submitLineupBonusBatchAction`, adjust review/award actions or deprecate old per-item award path.
- `lib/repo/admin-tools.ts` — add batch submit transaction, report creation, queue query with day filter/status.
- `app/(game)/admin/page.tsx` — load day-filtered queue data needed by new UI.
- `app/(game)/admin/AdminTools.tsx` — replace per-item bonus controls with filter + checkboxes + submit + summary modal + processed/return flow.
- `lib/types.ts` — add report/summary/history view types.
- `components/shell/Header.tsx` — add card bonus reports badge.
- `app/(game)/layout.tsx` — mount player report auto-open/modal as needed (or header-mounted with layout data).
- `lib/actions/lineups.ts` — keep validation but make responses autosave-friendly; avoid unnecessary revalidate if safe.
- `app/(game)/lineups/LineupsClient.tsx` — optimistic autosave, per-slot status, serialized saves, error rollback.
- `tests/unit/admin-tools.test.ts` or new targeted tests — schema/action behavior.

### Test
- `tests/unit/card-bonus-batch.test.ts`
- `tests/unit/card-bonus-reports.test.ts`
- `tests/unit/admin-bonus-schemas.test.ts` (new) or extend existing schema tests
- `tests/unit/lineups-autosave.test.ts` (new, pure helper/state logic)
- existing: `tests/unit/lineup-rules.test.ts` should remain green

## Task 1: Report data model and types

**Files:**
- Create: `supabase/migrations/0017_card_bonus_reports.sql`
- Modify: `lib/types.ts`
- Test: `tests/unit/card-bonus-reports.test.ts`

**Interfaces:**
- Produces DB tables (names can be finalized, but must support): report header (`id, season_id, actor_id, created_at, summary fields optional`), report item snapshot (`report_id, profile_id, lineup_slot_id, match_id, card_instance_id, awarded, points, snapshot fields: player nickname optional by join or snapshot, card name/photo/team/role/rarity/rating, match home/away/kickoff, slot`), player seen state (`profile_id/season_id/report_id or profile_id+last_seen_at/report_seen`).
- Produces TS types: `CardBonusReportItemView`, `CardBonusReportView`, `CardBonusReportsStateView`, `AdminCardBonusBatchResultView`.

- [ ] **Step 1: Write failing type/shape tests**

```ts
import { describe, expect, it } from 'vitest';
import type { CardBonusReportView } from '@/lib/types';

describe('card bonus report types', () => {
  it('supports awarded historical and submitted report items', () => {
    const item: CardBonusReportView['items'][number] = {
      reportId: 'r1',
      profileId: 'p1',
      lineupSlotId: 's1',
      matchId: 'm1',
      awarded: true,
      points: 20,
      cardName: 'Player',
      cardPhotoUrl: null,
      cardTeamName: 'Team',
      slot: 'OF1',
      roleGroup: 'MID',
      rarity: 'rare',
      rating: 7.2,
      homeTeamName: 'A',
      awayTeamName: 'B',
      kickoffAt: new Date(0).toISOString(),
      source: 'batch',
      createdAt: new Date(0).toISOString(),
    };
    expect(item.awarded).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/card-bonus-reports.test.ts`
Expected: FAIL because file/types/exports missing.

- [ ] **Step 3: Add minimal types and migration**

In `lib/types.ts`, add exported interfaces for report item/view/state and admin batch summary. In migration, create tables/indexes/FK/RLS consistent with existing patterns (`lineup_card_results`/`score_events`/`audit_log` nearby). Include `seen_at` or per-player seen table. Store enough snapshot fields to render history even if card/match changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/unit/card-bonus-reports.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (only with explicit user approval)**

```bash
git add supabase/migrations/0017_card_bonus_reports.sql lib/types.ts tests/unit/card-bonus-reports.test.ts
git commit -m "feat(cards): add card bonus report schema and types"
```

## Task 2: Batch decision domain helpers

**Files:**
- Create: `lib/game/card-bonus-batch.ts`
- Create: `tests/unit/card-bonus-batch.test.ts`

**Interfaces:**
- Produces pure helpers, e.g. `normalizeBatchDecision({ selectedSlotIds, visibleSlotIds })`, `computeBonusPoints(rarity)`, `shouldCreateCorrectionEntry(before, after)`, `groupReportItemsByProfile(items)`.
- Consumes `CardRarity`, `LINEUP_POINTS`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeBatchDecision, shouldCreateCorrectionEntry } from '@/lib/game/card-bonus-batch';

describe('card bonus batch', () => {
  it('marks visible selected as awarded and visible unselected as not awarded', () => {
    expect(normalizeBatchDecision({ visibleSlotIds: ['a','b','c'], selectedSlotIds: ['b'] }))
      .toEqual({ a: false, b: true, c: false });
  });

  it('creates correction entry when awarded state changes', () => {
    expect(shouldCreateCorrectionEntry({ awarded: true, points: 20 }, { awarded: false, points: 0 })).toBe(true);
    expect(shouldCreateCorrectionEntry({ awarded: true, points: 20 }, { awarded: true, points: 20 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/card-bonus-batch.test.ts`
Expected: FAIL module not found.

- [ ] **Step 3: Implement minimal pure helpers**

Keep helpers small and pure; no DB. Use exact spec semantics: only visible active slots, default empty selection means false.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/unit/card-bonus-batch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (only with explicit user approval)**

```bash
git add lib/game/card-bonus-batch.ts tests/unit/card-bonus-batch.test.ts
git commit -m "feat(cards): add batch bonus decision helpers"
```

## Task 3: Repo batch submit transaction + report creation

**Files:**
- Modify: `lib/repo/admin-tools.ts`
- Create: `lib/repo/card-bonus-reports.ts`
- Modify: `lib/actions/admin-schemas.ts`
- Test: `tests/unit/card-bonus-reports.test.ts`

**Interfaces:**
- Consumes: `LineupBonusManualInput` remains for compatibility/migration if needed; add `LineupBonusBatchSubmitInput` (`visibleSlotIds: uuid[]`, `selectedAwardedSlotIds: uuid[]`, optional `filterDay?: string` for audit/context only, not trust).
- Produces: `submitManualLineupBonusBatch(actorId, input): Promise<AdminCardBonusBatchResultView>` in repo/admin-tools or dedicated repo; creates report header/items and updates `lineup_card_results`/`score_events` atomically.
- Produces: `listCardBonusReportsForProfile(profileId, seasonId)`, `markCardBonusReportsSeen(profileId, seasonId, reportIds?)`, `getUnseenCardBonusReportCount(profileId, seasonId)`.

- [ ] **Step 1: Write failing repo tests (mocked DB where possible)**

Add tests for: selected awards, unselected visible become 0/unawarded+processed, filtered-out slot untouched, correction creates report entry, idempotent second submit same decision. Use existing project test style; if DB mocking is heavy, isolate pure shaping and add integration-style repo tests behind env guard.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- tests/unit/card-bonus-reports.test.ts`
Expected: FAIL missing functions/behavior.

- [ ] **Step 3: Implement batch transaction**

In transaction:
- Lock relevant `lineup_slots`/matches/cards rows (`for update`).
- Validate all visibleSlotIds exist, are FT, eligible role, belong to active queue scope expected by admin flow, and are unique.
- Compute decision from selected subset intersect visible.
- For each slot, determine before/after; upsert `lineup_card_results` awarded/points/method/reason/reviewed_at/by; upsert/delete `score_events`.
- Insert report header + item snapshots for processed slots (include awarded and no-points in stored report; player query filters awarded-only for history display, per decision 8).
- Insert audit log `lineup_bonus.batch_submit` with summary.
- Return admin summary + detailed items for modal.

For return-to-queue, keep old result (decision 7): update only reviewed state/queue state, not awarded/points/score_events.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- tests/unit/card-bonus-reports.test.ts tests/unit/card-bonus-batch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (only with explicit user approval)**

```bash
git add lib/repo/admin-tools.ts lib/repo/card-bonus-reports.ts lib/actions/admin-schemas.ts tests/unit/card-bonus-reports.test.ts
git commit -m "feat(cards): batch submit lineup bonuses with reports"
```

## Task 4: Admin server actions and queue query

**Files:**
- Modify: `lib/actions/admin.ts`
- Modify: `lib/actions/admin-schemas.ts`
- Modify: `app/(game)/admin/page.tsx`
- Test: `tests/unit/admin-bonus-schemas.test.ts`

**Interfaces:**
- Produces `submitLineupBonusBatchAction(input): Promise<AdminRunResult & { report?: AdminCardBonusBatchResultView }>` or a dedicated typed result.
- Produces `returnLineupBonusToQueueAction`/reuse `reviewLineupBonusAction` semantics aligned with decision 7.
- Queue query supports day filter and active/processed views: e.g. `listManualLineupBonusSlots({ day?: string, includeProcessed?: boolean })`.

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, expect, it } from 'vitest';
import { lineupBonusBatchSubmitSchema } from '@/lib/actions/admin-schemas';

describe('lineupBonusBatchSubmitSchema', () => {
  it('accepts visible and selected slot ids', () => {
    const r = lineupBonusBatchSubmitSchema.safeParse({
      visibleSlotIds: ['11111111-1111-4111-8111-111111111111'],
      selectedAwardedSlotIds: [],
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid uuid', () => {
    const r = lineupBonusBatchSubmitSchema.safeParse({ visibleSlotIds: ['bad'], selectedAwardedSlotIds: [] });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/admin-bonus-schemas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement schema/action/query**

- Add Zod schema; reject empty visible list if desired by UI, or allow and return no-op message.
- Action guards: DB, cardsEnabled, admin, schema, call repo, revalidate `/admin`, `/ratings`, `/lineups`, and any player report surfaces as needed.
- Keep old per-item award action only if still needed internally; UI should stop using it. Prefer removing UI dependency to reduce confusion.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/unit/admin-bonus-schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (only with explicit user approval)**

```bash
git add lib/actions/admin.ts lib/actions/admin-schemas.ts app/(game)/admin/page.tsx tests/unit/admin-bonus-schemas.test.ts
git commit -m "feat(admin): add batch lineup bonus submit action"
```

## Task 5: Admin UI batch flow

**Files:**
- Modify: `app/(game)/admin/AdminTools.tsx`
- Modify: `app/(game)/admin/page.tsx`
- Create: `components/cards/CardBonusReportsModal.tsx` (reuse for admin summary)
- Test: manual UI check + existing type/test suite

**Interfaces:**
- Consumes: `manualBonusSlots` with day/processed info; new batch submit action result.
- Produces: day filter, checkboxes default empty, one submit button, processed view/return-to-queue, admin summary modal.

- [ ] **Step 1: Write failing UI-oriented tests if feasible**

If component tests exist in repo, add one for batch selection state helper. Otherwise create pure helper in `lib/game/card-bonus-batch.ts` for visible selection and test it (Task 2 covers core).

- [ ] **Step 2: Run targeted tests**

Run: `npm run test:run -- tests/unit/card-bonus-batch.test.ts`
Expected: PASS before UI wiring.

- [ ] **Step 3: Implement AdminTools changes**

- Add day filter derived from slot kickoff dates (MSK calendar day). Default to newest day with active items.
- Maintain selected slot IDs in local state; reset when filter/data changes appropriately.
- Render checkboxes only for active visible slots. No per-item award/review buttons in default flow; keep processed list with "Вернуть в очередь".
- Submit calls batch action with `visibleSlotIds` (active visible) and `selectedAwardedSlotIds`.
- On success, open summary modal with returned report details and refresh data.
- Disable controls while pending; show clear feedback.

- [ ] **Step 4: Run checks**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit (only with explicit user approval)**

```bash
git add app/(game)/admin/AdminTools.tsx app/(game)/admin/page.tsx components/cards/CardBonusReportsModal.tsx
git commit -m "feat(admin): batch card bonus review UI"
```

## Task 6: Player history read/seen and badge/modal

**Files:**
- Create: `lib/actions/card-bonus-reports.ts`
- Create: `components/cards/CardBonusReportsBadge.tsx`
- Modify: `components/shell/Header.tsx`
- Modify: `app/(game)/layout.tsx`
- Modify: `lib/repo/card-bonus-reports.ts`
- Test: `tests/unit/card-bonus-reports.test.ts`

**Interfaces:**
- Produces actions: `getMyCardBonusReportsAction()`, `markMyCardBonusReportsSeenAction(reportIds?)`, `getMyUnseenCardBonusReportsCountAction()`.
- Produces header badge with persistent access; modal opens history. Auto-open once when unseen exist (decision 9), then close marks seen.

- [ ] **Step 1: Write failing tests for history filtering**

Test that player history includes awarded historical+batch items, excludes no-points items, and marks unseen correctly.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/card-bonus-reports.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement repo/action/UI**

- Repo query returns awarded-only history for player, newest first; include historical pre-feature awards by synthesizing from `lineup_card_results`/`score_events`/joins where report item absent (decision 8).
- Seen state: store per player per report/item delivery; closing auto-open modal marks currently unseen as seen.
- Header badge pattern similar to unopened packs: lightweight count fetch on mount/focus/interval/custom event; clicking opens modal.
- Layout mounts modal/badge provider so available on any game page.

- [ ] **Step 4: Run checks**

Run: `npm run typecheck && npm run test:run -- tests/unit/card-bonus-reports.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (only with explicit user approval)**

```bash
git add lib/actions/card-bonus-reports.ts lib/repo/card-bonus-reports.ts components/cards/CardBonusReportsBadge.tsx components/shell/Header.tsx app/(game)/layout.tsx
git commit -m "feat(cards): player card bonus history badge and modal"
```

## Task 7: Lineup autosave

**Files:**
- Modify: `app/(game)/lineups/LineupsClient.tsx`
- Modify: `lib/actions/lineups.ts`
- Optionally create: `lib/game/lineup-autosave.ts`
- Test: `tests/unit/lineups-autosave.test.ts`

**Interfaces:**
- Produces per-slot autosave state machine: `idle | saving | saved | error`.
- Produces serialized save queue per slot key (`matchId:slot`) to prevent stale overwrite.
- Consumes existing `saveLineupSlotAction`, `removeLineupSlotAction`.

- [ ] **Step 1: Write failing pure state/helper tests**

```ts
import { describe, expect, it } from 'vitest';
import { shouldApplySaveResult } from '@/lib/game/lineup-autosave';

describe('lineup autosave', () => {
  it('ignores stale save result when newer request exists', () => {
    expect(shouldApplySaveResult({ requestId: 1, latestRequestId: 2 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/lineups-autosave.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement autosave UI**

- On select change: optimistic update immediately, enqueue/save in background.
- Show small status near slot: saving/saved/error.
- Remove required Save button; keep Remove.
- On error: revert slot to last confirmed server value and show clear feedback.
- Avoid `router.refresh()` after every successful save; use local confirmed state. If needed, refresh only on structural changes.
- Serialize per slot; allow different slots in parallel.

- [ ] **Step 4: Run checks**

Run: `npm run typecheck && npm run test:run -- tests/unit/lineups-autosave.test.ts tests/unit/lineup-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (only with explicit user approval)**

```bash
git add app/(game)/lineups/LineupsClient.tsx lib/actions/lineups.ts lib/game/lineup-autosave.ts tests/unit/lineups-autosave.test.ts
git commit -m "feat(lineups): autosave lineup slots without blocking waits"
```

## Task 8: Verification, docs, and handoff

**Files:**
- Modify: `docs/WORKING_STATE.md` (after implementation/verification)
- Modify: `docs/superpowers/specs/2026-11-26-card-points-batch-and-lineup-autosave-design.md` status if implemented
- Test: full required checks

- [ ] **Step 1: Run focused tests**

Run: `npm run test:run -- tests/unit/card-bonus-batch.test.ts tests/unit/card-bonus-reports.test.ts tests/unit/admin-bonus-schemas.test.ts tests/unit/lineups-autosave.test.ts tests/unit/lineup-rules.test.ts`
Expected: PASS.

- [ ] **Step 2: Run required project checks**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run test:run`
Expected: PASS (note any pre-existing unrelated failures separately if they occur).

- [ ] **Step 3: Manual UI smoke (local/dev environment if DB connected)**

Verify: admin day filter, empty default checkboxes, batch submit visible-only, summary modal; processed return keeps old points until resubmit; player badge auto-opens once on new result, history always available, awarded-only + historical records; lineup autosave quick multi-slot edits no wait and correct rollback on error.

- [ ] **Step 4: Update docs**

Update `docs/WORKING_STATE.md` with what changed, checks run, and any pending approvals (commit/push/deploy/migration apply). Record any significant decision deviations.

- [ ] **Step 5: Commit/docs (only with explicit user approval)**

```bash
git add docs/WORKING_STATE.md docs/superpowers/specs/2026-11-26-card-points-batch-and-lineup-autosave-design.md
git commit -m "docs: record card bonus batch and lineup autosave work"
```

## Self-Review

- Spec coverage: batch admin flow, day filter, checkbox+single submit, visible-only scope, auto points, admin+player big modal, awarded-only player history, historical pre-feature awards, unseen auto-open once + persistent badge, lineup autosave, return-to-queue correction semantics — all mapped to tasks.
- Type consistency: `CardBonusReport*` types, batch submit input/result names, and lineup autosave helper names must be kept consistent when implementing; executor should grep before renaming.
- Review focus: 5 cases listed above have owning tasks/tests.
- Placeholder scan: no TBD behavior in agreed decisions; builder calls explicitly marked (exact schema shape, seen storage shape, day filter UI control, auto-open mount location) with constraints.
