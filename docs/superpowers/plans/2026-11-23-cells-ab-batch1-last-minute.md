# Клетки A+B — Батч 1: «Последняя минута» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать механику 15 «Последняя минута» (push-your-luck choice) как полный pending flow (engine, expiry, actions, repo, types, UI, tests), без размещения на живой карте.

**Architecture:** Чистая логика в `lib/game/engine.ts` и `lib/game/pending-expiry.ts`; оркестрация/транзакции в `lib/repo/game-tx.ts`, `lib/repo/pending.ts`, `lib/actions/game.ts`; UI в `components/map/GameHud.tsx`. Многошаговый выбор моделируется одним `pending_actions` с payload `{ stage, currentReward }`, который обновляется на промежуточном шаге и закрывается только на финальном решении/таймауте.

**Tech Stack:** Next.js 15, TypeScript, Vitest, postgres (`postgres` package), существующие game-tx/helpers.

**Spec:** `docs/superpowers/specs/2026-11-23-cells-ab-batch1-last-minute-design.md`

## Global Constraints

- Поведение строго по `docs/04-mechanics.md` §15: старт `+1`; продолжить #1 → 60% `+3`, 40% `0`; продолжить #2 → 40% `+5`, 60% `0`; можно остановиться и забрать текущее; провал обнуляет только награду события; вероятности видны заранее.
- Один pending на событие: `kind='last_minute'`, payload `{ stage: 1|2, currentReward: 1|3 }`. Continue stage1 success → обновить payload на stage2/currentReward=3, pending остаётся открытым. Все финальные исходы закрывают pending и cell_event.
- Таймаут 24h: безопасная ветка — автозабрать `currentReward` (согласовано). Лог формата `"<ник> не ответил — судья решил за него: ..."`.
- Награда применяется только при финальном разрешении (stop / final continue result / expiry). Промежуточный stage1->stage2 не двигает игрока.
- Добровольный риск: Щитки не защищают от плохих исходов «Последней минуты».
- Не размещать на live/reworked board, не менять `cells`/раскладку. Не добавлять DB migrations без отдельного согласования (существующая схема `pending_actions.payload jsonb`, `cell_events` достаточна).
- Никаких секретов/токенов. Не коммитить/не пушить без явного запроса.

## Review Focus

- **Многошаговый pending/idempotency:** повторный submit на закрытый pending даёт безопасную ошибку; continue на stage1 не закрывает pending/cell_event; двойной continue/stop не применяет движение дважды.
- **Expiry payload:** `expiryDecision`/`applyExpiryDecision` получают достаточный контекст для `last_minute` (currentReward из payload), и все call sites обновлены (`lib/repo/pending.ts`, `lib/repo/admin-tools.ts`).
- **Промежуточный шаг не двигает:** stage1 success переводит в stage2 с `currentReward=3`, но position/delta события не применяются до финала.
- **UI state refresh:** после continue stage1 GameHud показывает stage2/currentReward=3 (через refresh/revalidate), без залипания на stage1.
- **Demo/server parity:** server action path обязателен; demo ветка не должна ломать типы/рендер и следует существующему паттерну простых новых choice-механик.

## File Structure

- Modify: `lib/game/engine.ts` — добавить `last_minute` в `CellChoice`, `case '15'`, чистую функцию `applyLastMinute`.
- Modify: `lib/game/pending-expiry.ts` — добавить `last_minute` в expirable kinds, decision type, `expiryDecision`, `expiryLog`.
- Modify: `lib/repo/pending.ts` — expiry применение для `last_minute` (движение на currentReward).
- Modify: `lib/repo/admin-tools.ts` — передавать payload/context в `expiryDecision` при force-close.
- Modify: `lib/repo/game-tx.ts` — при создании pending для `last_minute` сохранять начальный payload `{stage:1,currentReward:1}`.
- Modify: `lib/actions/game.ts` — добавить `chooseLastMinuteAction`.
- Modify: `lib/types.ts` — добавить `last_minute` в `PendingChoiceView.kind`.
- Modify: `components/map/GameHud.tsx` — Pending type, seedPending, handler, EventModal props/render.
- Modify: `tests/unit/engine.test.ts` — кейсы механики 15.
- Modify: `tests/unit/pending-expiry.test.ts` — expiry для last_minute.

---

### Task 1: Engine — типы и разрешение механики 15

**Files:**
- Modify: `lib/game/engine.ts`
- Test: `tests/unit/engine.test.ts`

**Interfaces:**
- Consumes: existing `PlayerState`, `CellOutcome`, `moveBy`, `base`, `moved`.
- Produces: `CellChoice` включает `'last_minute'`; `resolveCell(state,'15',who)` возвращает `awaiting:'last_minute'`, `delta:0`, без движения; новая экспортируемая функция `applyLastMinute(...)`.

**Types/signatures (exact):**

```ts
// CellChoice union adds:
| 'last_minute'

// New exported type:
export type LastMinuteResolution =
  | { done: true; outcome: CellOutcome }
  | { done: false; stage: 2; currentReward: 3; log: string };

// New exported function:
export function applyLastMinute(
  state: PlayerState,
  choice: 'stop' | 'continue',
  stage: 1 | 2,
  currentReward: 1 | 3,
  random: () => number = Math.random,
): LastMinuteResolution
```

- [ ] **Step 1: Write failing engine tests**

Add to `tests/unit/engine.test.ts`:

```ts
import { applyLastMinute, resolveCell, makePlayer } from '@/lib/game/engine';

it('15: creates pending last_minute with no movement', () => {
  const out = resolveCell(makePlayer(20), '15', 'Тест');
  expect(out.awaiting).toBe('last_minute');
  expect(out.delta).toBe(0);
  expect(out.state.position).toBe(20);
  expect(out.log).toContain('Последняя минута');
});

it('15: stop at stage1 takes +1', () => {
  const res = applyLastMinute(makePlayer(20), 'stop', 1, 1, () => 0.0);
  expect(res.done).toBe(true);
  if (res.done) {
    expect(res.outcome.state.position).toBe(21);
    expect(res.outcome.delta).toBe(1);
  }
});

it('15: continue stage1 success moves to stage2 pending', () => {
  const res = applyLastMinute(makePlayer(20), 'continue', 1, 1, () => 0.59);
  expect(res).toEqual({ done: false, stage: 2, currentReward: 3, log: expect.any(String) });
});

it('15: continue stage1 fail resolves to 0', () => {
  const res = applyLastMinute(makePlayer(20), 'continue', 1, 1, () => 0.6);
  expect(res.done).toBe(true);
  if (res.done) {
    expect(res.outcome.state.position).toBe(20);
    expect(res.outcome.delta).toBe(0);
  }
});

it('15: continue stage2 success gives +5', () => {
  const res = applyLastMinute(makePlayer(20), 'continue', 2, 3, () => 0.39);
  expect(res.done).toBe(true);
  if (res.done) {
    expect(res.outcome.state.position).toBe(25);
    expect(res.outcome.delta).toBe(5);
  }
});

it('15: continue stage2 fail resolves to 0', () => {
  const res = applyLastMinute(makePlayer(20), 'continue', 2, 3, () => 0.4);
  expect(res.done).toBe(true);
  if (res.done) {
    expect(res.outcome.state.position).toBe(20);
    expect(res.outcome.delta).toBe(0);
  }
});

it('15: stop at stage2 takes current +3', () => {
  const res = applyLastMinute(makePlayer(20), 'stop', 2, 3, () => 0.0);
  expect(res.done).toBe(true);
  if (res.done) {
    expect(res.outcome.state.position).toBe(23);
    expect(res.outcome.delta).toBe(3);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- tests/unit/engine.test.ts`  
Expected: FAIL because `applyLastMinute`/`last_minute`/case `15` missing.

- [ ] **Step 3: Implement minimal engine support**

In `lib/game/engine.ts`:
- Add `'last_minute'` to `CellChoice`.
- Add `export type LastMinuteResolution = ...` as above.
- Add `case '15'` in `resolveCell`:

```ts
case '15':
  return {
    ...base(code, state, `Последняя минута: ${who} может забрать +1 или рискнуть за +3.`),
    awaiting: 'last_minute',
  };
```

- Add `applyLastMinute` with exact branching:
  - `stop`: `delta = currentReward`; if delta>0 `moved('15', ..., moveBy(state, delta), ...)` else `base('15', state, ...)` with delta 0.
  - `continue, stage 1`: `random() < 0.6` → `{done:false, stage:2, currentReward:3, log:'...'}`; else final fail `base/moved` with delta 0.
  - `continue, stage 2`: `random() < 0.4` → final moved +5; else final fail delta 0.

Logs should be plain Russian and mention probabilities/outcome clearly. No shield interaction.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:run -- tests/unit/engine.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game/engine.ts tests/unit/engine.test.ts
git commit -m "feat(game): add last minute engine mechanic"
```

### Task 2: Pending expiry — безопасная ветка для last_minute

**Files:**
- Modify: `lib/game/pending-expiry.ts`
- Modify: `lib/repo/pending.ts`
- Modify: `lib/repo/admin-tools.ts`
- Test: `tests/unit/pending-expiry.test.ts`

**Interfaces:**
- Produces: `ExpirableKind` includes `'last_minute'`; `ExpiryDecision` includes `{ kind:'last_minute'; currentReward: 1|3 }`; `expiryDecision(kind, effects, payload?)` can compute last_minute decision from payload.

**Signatures (exact target):**

```ts
export type ExpiryDecision =
  | { kind: 'var'; contest: false }
  | { kind: 'tactics'; delta: 0 }
  | { kind: 'locker'; remove: EffectCode | 'advance' }
  | { kind: 'passage'; targetId: null }
  | { kind: 'last_minute'; currentReward: 1 | 3 };

export const EXPIRABLE_KINDS = ['var', 'tactics', 'locker', 'passage', 'last_minute'] as const;

export function expiryDecision(
  kind: string,
  effects: readonly ActiveEffect[] = [],
  payload: Record<string, unknown> = {},
): ExpiryDecision | null
```

- [ ] **Step 1: Write failing expiry tests**

Add to `tests/unit/pending-expiry.test.ts`:

```ts
it('last_minute забирает текущую награду', () => {
  expect(expiryDecision('last_minute', [], { stage: 1, currentReward: 1 })).toEqual({
    kind: 'last_minute',
    currentReward: 1,
  });
  expect(expiryDecision('last_minute', [], { stage: 2, currentReward: 3 })).toEqual({
    kind: 'last_minute',
    currentReward: 3,
  });
});

it('last_minute лог содержит автозабор награды', () => {
  expect(expiryLog('Марк', { kind: 'last_minute', currentReward: 3 })).toContain('забирает текущую награду');
});
```

Also update `EXPIRABLE_KINDS` expectation if it asserts membership.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- tests/unit/pending-expiry.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement expiry decision/log**

In `lib/game/pending-expiry.ts`:
- Extend type/kinds/signature.
- In `expiryDecision`, for `last_minute` read `payload.currentReward`; accept only `1` or `3`, default to `1` if missing/invalid (safe, minimal reward) — document this in code comment.
- In `expiryLog`, add case: `забирает текущую награду +N`.

- [ ] **Step 4: Update repo/admin call sites**

In `lib/repo/pending.ts`:
- Pass payload: `expiryDecision(pending.kind, ctx.effects, pending.payload)`.
- In `applyExpiryDecision`, add `case 'last_minute'`:
  - compute moved state by `currentReward` using `moveBy`/`landingPosition` equivalent via engine helper or direct position math consistent with existing move semantics (`Math.min(LAST_CELL, state.position + reward)`); no new cell event chain.
  - `persistState`, `logActivity` with `expiryLog(ctx.nickname, decision)`, `closePending` with `{ auto: true, choice: 'stop', currentReward: decision.currentReward }`.

In `lib/repo/admin-tools.ts`:
- Pass payload: `expiryDecision(pending.kind, ctx.effects, pending.payload)`.

- [ ] **Step 5: Run tests**

Run: `npm run test:run -- tests/unit/pending-expiry.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/game/pending-expiry.ts lib/repo/pending.ts lib/repo/admin-tools.ts tests/unit/pending-expiry.test.ts
git commit -m "feat(game): add last minute expiry branch"
```

### Task 3: Game tx/action — создание и разрешение last_minute

**Files:**
- Modify: `lib/repo/game-tx.ts`
- Modify: `lib/actions/game.ts`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: pending created for `last_minute` has payload `{ stage:1, currentReward:1 }`; server action `chooseLastMinuteAction({ pendingId, choice })` resolves stop/continue with idempotent behavior.

**Signatures (exact):**

```ts
// lib/actions/game.ts
export async function chooseLastMinuteAction(input: {
  pendingId: string;
  choice: 'stop' | 'continue';
}): Promise<ActionResult>
```

- [ ] **Step 1: Write failing action/repo tests if present; otherwise add focused unit coverage where feasible**

Check for existing action tests patterns. If no direct action test harness, cover by engine + expiry unit tests and add a small repo-level/unit test only if straightforward. Do not invent heavy infra. At minimum, ensure typecheck will fail until union/action updated by adding temporary type-level expectation in test or rely on step 2 compile check.

- [ ] **Step 2: Implement types and pending payload creation**

In `lib/types.ts` add `'last_minute'` to `PendingChoiceView.kind`.

In `lib/repo/game-tx.ts`, when creating pending action after `outcome.awaiting`:

```ts
const pendingPayload = outcome.awaiting === 'last_minute'
  ? { stage: 1, currentReward: 1 }
  : {};
await tx`insert into pending_actions (..., payload) values (..., ${tx.json(pendingPayload)})`;
```

- [ ] **Step 3: Implement server action**

In `lib/actions/game.ts`:
- Import `applyLastMinute` from engine.
- Add `chooseLastMinuteAction`:
  - `requireViewer`; validate choice is `stop|continue`.
  - `db().begin(...)`; `lockPending`; `requirePendingKind(pending,'last_minute')`.
  - Read `stage` and `currentReward` from payload, validate allowed values (1/1 or 2/3), else `EVENT_NOT_CHOOSABLE`.
  - `lockPlayer`, `makePlayer`.
  - `const res = applyLastMinute(state, input.choice, stage, currentReward)`.
  - If `res.done === false`: update pending payload only:

```ts
await tx`update pending_actions set payload = ${tx.json({ stage: res.stage, currentReward: res.currentReward })} where id = ${pending.id}`;
await logActivity(tx, pending.season_id, viewer.profileId, 'neutral', res.log);
await closePending? NO
```

Do **not** close pending and **not** resolve cell_event. Optionally update `cell_events.outcome` json with progress, but do not set resolved.

  - If `res.done === true`: `persistState`, `logActivity` (kind by delta), `closePending` with payload including choice/stage/currentReward/finalDelta.
  - `revalidateGame(); return {ok:true}`.

- [ ] **Step 4: Run typecheck/tests**

Run: `npm run typecheck` and `npm run test:run -- tests/unit/engine.test.ts tests/unit/pending-expiry.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/repo/game-tx.ts lib/actions/game.ts lib/types.ts
git commit -m "feat(game): add last minute action flow"
```

### Task 4: GameHud UI — pending modal, seed, handlers

**Files:**
- Modify: `components/map/GameHud.tsx`

**Interfaces:**
- Produces: `PendingBody` includes `last_minute` payload `{ stage: 1|2; currentReward: 1|3 }`; seedPending restores it; handler calls `chooseLastMinuteAction`; EventModal renders choice with probabilities.

- [ ] **Step 1: Add types/imports/seed**

In `components/map/GameHud.tsx`:
- Import `chooseLastMinuteAction`.
- Extend `PendingBody` with `| { kind: 'last_minute'; payload: { stage: 1 | 2; currentReward: 1 | 3 } }`.
- In `seedPending`, handle `view.kind === 'last_minute'` validating stage/currentReward numbers.

- [ ] **Step 2: Add handler**

Add `chooseLastMinute` callback similar to simple choice handlers:

```ts
const chooseLastMinute = useCallback((choice: 'stop' | 'continue') => {
  const pendingId = pending?.kind === 'last_minute' ? pending.id : undefined;
  if (!snapshot.demo) {
    if (!pendingId) return;
    void runServerChoice(() => chooseLastMinuteAction({ pendingId, choice }), choice === 'continue' ? 'click' : 'reward');
    return;
  }
  setPending(null);
  router.refresh();
}, [pending, router, runServerChoice, snapshot.demo]);
```

Pass it into `EventModal`.

- [ ] **Step 3: Render modal**

In `EventModal` props add `onLastMinute: (choice: 'stop' | 'continue') => void`.

Add branch before default passage return:

```tsx
if (pending.kind === 'last_minute') {
  const { stage, currentReward } = pending.payload;
  const nextReward = stage === 1 ? 3 : 5;
  const successPct = stage === 1 ? 60 : 40;
  const failPct = 100 - successPct;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Последняя минута">
      <div className="modal__card">
        <div className="modal__eyebrow">Механика 15 · Последняя минута</div>
        <h2 className="modal__title">Забрать или рискнуть?</h2>
        <p className="modal__text">
          Текущая награда: +{currentReward}. Рискнуть: {successPct}% шанс +{nextReward}, {failPct}% шанс 0. Провал обнуляет только награду этого события.
        </p>
        <div className="modal__actions">
          <button type="button" className="btn" onClick={() => onLastMinute('stop')}>Забрать +{currentReward}</button>
          <button type="button" className="btn btn--primary" onClick={() => onLastMinute('continue')}>Рискнуть</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run typecheck/lint**

Run: `npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/map/GameHud.tsx
git commit -m "feat(game): add last minute pending UI"
```

### Task 5: Verification and docs

**Files:**
- Modify: `docs/WORKING_STATE.md` (update status after implementation)

- [ ] **Step 1: Run focused tests**

Run: `npm run test:run -- tests/unit/engine.test.ts tests/unit/pending-expiry.test.ts tests/unit/board.test.ts tests/unit/cards.test.ts`  
Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`  
Expected: PASS.

- [ ] **Step 3: Run broader safe suite if cheap**

Run: `npm run test:run`  
Expected: PASS, or report any unrelated pre-existing failures explicitly.

- [ ] **Step 4: Update WORKING_STATE**

Record batch 1 implementation status, files touched, tests run, and that live board was not changed. Keep G1a uncommitted note.

- [ ] **Step 5: Commit**

```bash
git add docs/WORKING_STATE.md
git commit -m "docs: update working state for last minute batch"
```

## Self-Review

**Spec coverage:** §15 behavior covered by Task 1 tests; pending model/expiry by Tasks 2-3; UI by Task 4; board unchanged by constraint; verification by Task 5. **Type consistency:** `CellChoice`, `PendingChoiceView.kind`, `PendingBody`, `expiryDecision` signature, `applyLastMinute` return shape - all named consistently. **Placeholder scan:** no TBD. **Review Focus:** idempotency covered by action behavior/closePending; expiry payload by Task 2; intermediate no-move by Task 1/3; UI refresh by Task 4+revalidate; demo parity noted.

## Execution Handoff

After user reviews plan: if they explicitly choose execution method, follow it. If not, offer Subagent-driven vs Native and wait. All questions to user must be plain Russian, no code/technical names.