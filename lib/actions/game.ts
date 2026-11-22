'use server';

/**
 * Серверные действия игры.
 *
 * Каждое действие — одна транзакция: блокировка строки игрока
 * (`SELECT … FOR UPDATE`), проверка права, запись и лог. Движок остаётся
 * чистым (`lib/game/*`), здесь только БД и порядок операций.
 *
 * В демо-режиме (нет `DATABASE_URL`) действия возвращают `CONFIG_MISSING`:
 * броски и выборы считает браузер на том же движке, см. `GameHud`.
 */

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getViewer, type Viewer } from '@/lib/auth/session';
import { AppError, isAppError } from '@/lib/errors';
import { hasDatabase, serverEnv } from '@/lib/env';
import { type DiceTier } from '@/lib/game/dice';
import {
  applyAttackBreak,
  applyCorner,
  applyDribble,
  applyFoul,
  applyLocker,
  applyPassage,
  applyPenalty,
  applyRedVar,
  applySuperSub,
  applyVar,
  makePlayer,
  type EffectCode,
} from '@/lib/game/engine';
import { applyTacticsChoice, planRoll } from '@/lib/game/roll';
import {
  LAST_CELL,
  closePending,
  ensureParticipant,
  lockPending,
  lockPlayer,
  logActivity,
  moveAndResolve,
  persistState,
  requirePendingKind,
  type PlayerContext,
} from '@/lib/repo/game-tx';
import { getActiveClubPack, getActiveNationalPack, grantNationalPack } from '@/lib/repo/cards';
import { parseOptions } from '@/lib/repo/mappers';
import { loadMatchdayPredictions } from '@/lib/repo/season';

export type RollResult = {
  base: number;
  value: number;
  tier: DiceTier;
  from: number;
  needsTactics: boolean;
};

export type ActionResult =
  | { ok: true; redirectTo?: string; roll?: RollResult }
  | { ok: false; message: string; code?: string };

const TIER_LABEL: Record<DiceTier, string> = {
  gold: 'золотой',
  silver: 'серебряный',
  bronze: 'бронзовый',
  wood: 'деревянный',
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- общие помощники ----------

function toResult(error: unknown): ActionResult {
  if (isAppError(error)) {
    return { ok: false, code: error.code, message: error.message };
  }

  const code = (error as { code?: string } | null)?.code;
  if (code === '23505') {
    return { ok: false, code: 'CONFLICT_RETRY', message: 'Кто-то успел раньше. Попробуй ещё раз' };
  }
  if (code === '40001' || code === '40P01') {
    return { ok: false, code: 'CONFLICT_RETRY', message: 'Игра обновляется. Повтори через секунду' };
  }

  console.error('Игровое действие не выполнено:', error);
  return { ok: false, message: 'Не получилось. Попробуй ещё раз' };
}

function demoOnly(): ActionResult {
  return {
    ok: false,
    code: 'CONFIG_MISSING',
    message: 'Демо-режим: всё считается здесь же, в браузере',
  };
}

function revalidateGame(): void {
  revalidatePath('/', 'layout');
}

async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AppError('AUTH_REQUIRED');
  if (viewer.role === 'spectator') throw new AppError('FORBIDDEN', 'Зрительский режим: играть нельзя');
  return viewer;
}

// ---------- бросок ----------

export async function submitRollAction(input: {
  matchdayId: string;
  tier: DiceTier;
  idempotencyKey?: string;
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireViewer();
    const tier = input.tier;
    if (!(tier in TIER_LABEL)) throw new AppError('NO_DICE');

    // Ключ приходит от клиента и переиспользуется при повторном клике:
    // параллельный дубль упирается в unique(idempotency_key) и не двигает дважды.
    const key =
      input.idempotencyKey && UUID_RE.test(input.idempotencyKey) ? input.idempotencyKey : crypto.randomUUID();

    const rollResult = await db().begin(async (tx): Promise<RollResult | null> => {
      const [matchday] = await tx<{ id: string; season_id: string }[]>`
        select id, season_id from matchdays where id = ${input.matchdayId}
      `;
      if (!matchday) throw new AppError('MATCHDAY_NOT_READY');

      const ctx = await lockPlayer(tx, matchday.season_id, viewer.profileId);

      if (ctx.position >= LAST_CELL) throw new AppError('PLAYER_FINISHED');

      const [pending] = await tx<{ id: string }[]>`
        select id
          from pending_actions
         where season_id = ${matchday.season_id}
           and profile_id = ${viewer.profileId}
           and resolved_at is null
           and expires_at > now()
         limit 1
      `;
      if (pending) throw new AppError('PENDING_ACTION_BLOCKS_ROLL');

      const [repeated] = await tx<{ id: string }[]>`
        select id from rolls where idempotency_key = ${key} limit 1
      `;
      if (repeated) return null;

      const [die] = await tx<{ id: string }[]>`
        select id
          from dice
         where season_id = ${matchday.season_id}
           and profile_id = ${viewer.profileId}
           and tier = ${tier}::dice_tier
           and consumed_at is null
         order by granted_at
         limit 1
         for update skip locked
      `;
      if (!die) throw new AppError('NO_DICE');

      await tx`update dice set consumed_at = now() where id = ${die.id}`;

      const plan = planRoll(makePlayer(ctx.position, ctx.effects), tier, Math.random);

      const [roll] = await tx<{ id: string }[]>`
        insert into rolls (
          season_id, profile_id, dice_id, base_value, value, from_position, state, modifiers, idempotency_key
        ) values (
          ${matchday.season_id},
          ${viewer.profileId},
          ${die.id},
          ${plan.base},
          ${plan.value},
          ${ctx.position},
          'pending_move',
          ${tx.json({ tribuny: ctx.effects.some((e) => e.code === 'tribuny'), gazon: ctx.effects.some((e) => e.code === 'gazon'), tactics: plan.needsTactics })},
          ${key}
        )
        returning id
      `;
      if (!roll) throw new AppError('CONFLICT_RETRY');

      await logActivity(
        tx,
        matchday.season_id,
        viewer.profileId,
        'roll',
        `${ctx.nickname} бросил ${TIER_LABEL[tier]} кубик: ${plan.value}`,
      );

      const info: RollResult = {
        base: plan.base,
        value: plan.value,
        tier,
        from: ctx.position,
        needsTactics: plan.needsTactics,
      };

      if (plan.needsTactics) {
        // Тактику нужно решать на стороне клиента: сохраняем в транзакции,
        // показываем выбор бросок/вперёд-назад.
        await persistState(tx, ctx, plan.state);
        await tx`
          insert into pending_actions (season_id, profile_id, kind, payload)
          values (
            ${matchday.season_id},
            ${viewer.profileId},
            'tactics',
            ${tx.json({ rollId: roll.id, value: plan.value, base: plan.base, tier, from: ctx.position })}
          )
        `;
        return info;
      }

      await moveAndResolve(tx, ctx, plan.state, plan.value, roll.id);
      return info;
    });

    revalidateGame();
    return rollResult ? { ok: true, roll: rollResult } : { ok: true };
  } catch (error) {
    // Защита от повторного unique-конфликта - идемпотентный повтор: бросок уже принят.
    if ((error as { code?: string } | null)?.code === '23505') {
      return { ok: true };
    }
    return toResult(error);
  }
}

// ---------- выбор тактики ----------

export async function chooseTacticsAction(input: {
  pendingId: string;
  delta: number;
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireViewer();

    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'tactics');

      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);

      const rollId = typeof pending.payload.rollId === 'string' ? pending.payload.rollId : null;
      if (!rollId) throw new AppError('EVENT_NOT_CHOOSABLE');

      const [roll] = await tx<{ id: string; value: number | string; state: string }[]>`
        select id, value, state from rolls where id = ${rollId} for update
      `;
      if (!roll || roll.state !== 'pending_move') throw new AppError('ROLL_ALREADY_MOVED');

      const choice = applyTacticsChoice(makePlayer(ctx.position, ctx.effects), Number(roll.value), input.delta);
      await moveAndResolve(tx, ctx, choice.state, choice.value, roll.id);

      await logActivity(
        tx,
        pending.season_id,
        viewer.profileId,
        'neutral',
        choice.delta === 0
          ? 'Тактическая схема: оставляем как есть.'
          : `Тактическая схема: ${choice.delta > 0 ? 'плюс' : 'минус'} один к броску.`,
      );

      await closePending(tx, pending, { choice: choice.delta });
    });

    revalidateGame();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

// ---------- VAR ----------

export async function chooseVarAction(input: {
  pendingId: string;
  contest: boolean;
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireViewer();

    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'var');

      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      const outcome = applyVar(makePlayer(ctx.position, ctx.effects), input.contest);

      await persistState(tx, ctx, outcome.state);
      await logActivity(tx, pending.season_id, viewer.profileId, input.contest ? 'neutral' : 'negative', outcome.log);
      await closePending(tx, pending, { contest: input.contest, delta: outcome.delta });
    });

    revalidateGame();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

// ---------- голевая передача ----------

export async function choosePassageAction(input: {
  pendingId: string;
  targetId: string | null;
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireViewer();

    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'passage');

      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);

      if (!input.targetId) {
        await logActivity(tx, pending.season_id, viewer.profileId, 'system', `${ctx.nickname} решает остаться на месте.`);
        await closePending(tx, pending, { given: false });
        return;
      }

      const [target] = await tx<{ profile_id: string; position: number | string }[]>`
        select profile_id, position
          from season_players
         where season_id = ${pending.season_id}
           and profile_id = ${input.targetId}
           and is_active
           for update
      `;
      if (!target) throw new AppError('PLAYER_NOT_IN_SEASON');

      const [targetProfile] = await tx<{ nickname: string }[]>`
        select nickname from profiles where id = ${input.targetId}
      `;

      const result = applyPassage(
        makePlayer(ctx.position, ctx.effects),
        makePlayer(Number(target.position)),
        true,
      );

      const targetCtx: PlayerContext = {
        seasonId: pending.season_id,
        profileId: input.targetId,
        nickname: targetProfile?.nickname ?? 'Игрок',
        position: Number(target.position),
        effects: [],
      };

      await persistState(tx, targetCtx, result.receiver);
      await logActivity(
        tx,
        pending.season_id,
        input.targetId,
        'positive',
        `Голевая передача от ${ctx.nickname}: ${targetCtx.nickname} делает шаг вперёд.`,
      );
      await closePending(tx, pending, { given: true, targetId: input.targetId, delta: result.delta });
    });

    revalidateGame();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

// ---------- раздевалка ----------

export async function chooseLockerAction(input: {
  pendingId: string;
  remove: EffectCode | 'advance';
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireViewer();

    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'locker');

      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      const outcome = applyLocker(makePlayer(ctx.position, ctx.effects), input.remove);

      await persistState(tx, ctx, outcome.state);
      await logActivity(
        tx,
        pending.season_id,
        viewer.profileId,
        input.remove === 'advance' ? 'neutral' : 'positive',
        outcome.log,
      );
      await closePending(tx, pending, { removed: input.remove });
    });

    revalidateGame();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

// ---------- Пак на выбор (19) ----------

export async function choosePackChoiceAction(input: {
  pendingId: string;
  packKind: 'national' | 'club';
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireViewer();
    if (input.packKind !== 'national' && input.packKind !== 'club') {
      throw new AppError('INVALID_INPUT');
    }

    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'pack_choice');

      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      const requested = input.packKind === 'club'
        ? await getActiveClubPack(pending.season_id, tx as never)
        : await getActiveNationalPack(pending.season_id, tx as never);

      if (!requested) {
        const alternative = input.packKind === 'club'
          ? await getActiveNationalPack(pending.season_id, tx as never)
          : await getActiveClubPack(pending.season_id, tx as never);
        if (!alternative) {
          await logActivity(
            tx,
            pending.season_id,
            viewer.profileId,
            'neutral',
            `${ctx.nickname} не получил пак: нет активных паков.`,
          );
          await closePending(tx, pending, { granted: null, reason: 'no_active_packs' });
          return;
        }
        throw new AppError('INVALID_INPUT', 'Выбранный тип пака сейчас недоступен');
      }

      const granted = await grantNationalPack(
        {
          seasonId: pending.season_id,
          profileId: viewer.profileId,
          packId: requested.id,
          source: 'cell',
          cellEventId: pending.event_id ?? undefined,
        },
        tx as never,
      );

      const label = input.packKind === 'club' ? 'клубный пак' : 'пак сборных';
      await logActivity(
        tx,
        pending.season_id,
        viewer.profileId,
        'positive',
        granted
          ? `${ctx.nickname} выбрал ${label} и получил «${requested.title}».`
          : `${ctx.nickname} выбрал ${label}, но пак уже был выдан.`,
      );
      await closePending(tx, pending, {
        granted: granted?.id ?? null,
        packKind: input.packKind,
        packId: requested.id,
      });
    });

    revalidateGame();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

// ---------- Выбор/риск механики (21,23,27,28,29) ----------

export async function choosePenaltyAction(input: {
  pendingId: string;
  choice: 'shoot' | 'pass';
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'penalty');
      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      const outcome = applyPenalty(makePlayer(ctx.position, ctx.effects), input.choice);
      await persistState(tx, ctx, outcome.state);
      await logActivity(tx, pending.season_id, viewer.profileId, outcome.delta >= 0 ? 'positive' : 'negative', outcome.log);
      await closePending(tx, pending, { choice: input.choice, delta: outcome.delta });
    });
    revalidateGame();
    return { ok: true };
  } catch (error) { return toResult(error); }
}

export async function chooseDribbleAction(input: {
  pendingId: string;
  choice: 'beat' | 'pass';
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'dribble');
      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      const outcome = applyDribble(makePlayer(ctx.position, ctx.effects), input.choice);
      await persistState(tx, ctx, outcome.state);
      await logActivity(tx, pending.season_id, viewer.profileId, outcome.delta >= 0 ? 'positive' : 'negative', outcome.log);
      await closePending(tx, pending, { choice: input.choice, delta: outcome.delta });
    });
    revalidateGame();
    return { ok: true };
  } catch (error) { return toResult(error); }
}

export async function chooseSuperSubAction(input: {
  pendingId: string;
  choice: 'buff' | 'shield';
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'super_sub');
      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      const outcome = applySuperSub(makePlayer(ctx.position, ctx.effects), input.choice);
      await persistState(tx, ctx, outcome.state);
      await logActivity(tx, pending.season_id, viewer.profileId, 'positive', outcome.log);
      await closePending(tx, pending, { choice: input.choice, delta: outcome.delta });
    });
    revalidateGame();
    return { ok: true };
  } catch (error) { return toResult(error); }
}

export async function chooseCornerAction(input: {
  pendingId: string;
  choice: 'simple' | 'risky';
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'corner');
      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      const outcome = applyCorner(makePlayer(ctx.position, ctx.effects), input.choice);
      await persistState(tx, ctx, outcome.state);
      await logActivity(tx, pending.season_id, viewer.profileId, outcome.delta >= 0 ? 'positive' : 'negative', outcome.log);
      await closePending(tx, pending, { choice: input.choice, delta: outcome.delta });
    });
    revalidateGame();
    return { ok: true };
  } catch (error) { return toResult(error); }
}

export async function chooseFoulAction(input: {
  pendingId: string;
  choice: 'defend' | 'dispute';
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'foul');
      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      const outcome = applyFoul(makePlayer(ctx.position, ctx.effects), input.choice);
      await persistState(tx, ctx, outcome.state);
      await logActivity(tx, pending.season_id, viewer.profileId, outcome.delta >= 0 ? 'neutral' : 'negative', outcome.log);
      await closePending(tx, pending, { choice: input.choice, delta: outcome.delta });
    });
    revalidateGame();
    return { ok: true };
  } catch (error) { return toResult(error); }
}

// ---------- Глобальные/таргет механики (33,34) ----------

export async function chooseRedVarAction(input: {
  pendingId: string;
  targetProfileId: string;
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'red_var');
      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      if (input.targetProfileId === viewer.profileId) throw new AppError('INVALID_INPUT');
      const [target] = await tx<Array<{ profile_id: string; position: number; finished_at: Date | null }>>`
        select sp.profile_id, sp.position, sp.finished_at
          from season_players sp
         where sp.season_id = ${pending.season_id}
           and sp.profile_id = ${input.targetProfileId}
           and sp.is_active = true
           and sp.finished_at is null
         limit 1
      `;
      if (!target) throw new AppError('INVALID_INPUT', 'Цель недоступна');
      const outcome = applyRedVar(makePlayer(ctx.position, ctx.effects));
      if (outcome.sideEffects?.some((e) => e.kind === 'move_target')) {
        const newPos = Math.max(1, Math.min(LAST_CELL, target.position - 3));
        await tx`
          update season_players
             set position = ${newPos},
                 finished_at = case when ${newPos} >= ${LAST_CELL} and finished_at is null then now() else finished_at end
           where season_id = ${pending.season_id} and profile_id = ${input.targetProfileId}
        `;
        await logActivity(tx, pending.season_id, input.targetProfileId, 'negative', `Красный VAR: цель откатывается на 3 клетки.`);
      } else {
        await persistState(tx, ctx, outcome.state);
      }
      await logActivity(tx, pending.season_id, viewer.profileId, outcome.delta < 0 ? 'negative' : 'positive', outcome.log);
      await closePending(tx, pending, { targetProfileId: input.targetProfileId, delta: outcome.delta });
    });
    revalidateGame();
    return { ok: true };
  } catch (error) { return toResult(error); }
}

export async function chooseAttackBreakAction(input: {
  pendingId: string;
  targetProfileId: string | null;
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'attack_break');
      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      let hasTarget = false;
      if (input.targetProfileId) {
        if (input.targetProfileId === viewer.profileId) throw new AppError('INVALID_INPUT');
        const [target] = await tx<Array<{ profile_id: string; position: number }>>`
          select sp.profile_id, sp.position
            from season_players sp
           where sp.season_id = ${pending.season_id}
             and sp.profile_id = ${input.targetProfileId}
             and sp.is_active = true
             and sp.finished_at is null
             and sp.position > ${ctx.position}
           limit 1
        `;
        if (!target) throw new AppError('INVALID_INPUT', 'Цель недоступна');
        hasTarget = true;
        const newPos = Math.max(1, target.position - 2);
        await tx`
          update season_players set position = ${newPos},
            finished_at = case when ${newPos} >= ${LAST_CELL} and finished_at is null then now() else finished_at end
           where season_id = ${pending.season_id} and profile_id = ${input.targetProfileId}
        `;
        await logActivity(tx, pending.season_id, input.targetProfileId, 'negative', `Срыв атаки: цель откатывается на 2 клетки.`);
      }
      const outcome = applyAttackBreak(makePlayer(ctx.position, ctx.effects), hasTarget);
      if (!hasTarget) await persistState(tx, ctx, outcome.state);
      await logActivity(tx, pending.season_id, viewer.profileId, hasTarget ? 'positive' : 'neutral', outcome.log);
      await closePending(tx, pending, { targetProfileId: input.targetProfileId, delta: outcome.delta });
    });
    revalidateGame();
    return { ok: true };
  } catch (error) { return toResult(error); }
}

// ---------- ответ на вопрос ----------

export async function submitAnswerAction(input: {
  questionId: string;
  choice: string;
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireViewer();

    await db().begin(async (tx) => {
      const [question] = await tx<
        Array<{
          id: string;
          season_id: string;
          status: string;
          locks_at: string | Date;
          options: unknown;
          matchday_status: string;
          closes_at: string | Date;
        }>
      >`
        select
          q.id,
          md.season_id,
          q.status,
          q.locks_at,
          q.options,
          md.status as matchday_status,
          md.closes_at
        from questions q
        join matchdays md on md.id = q.matchday_id
        where q.id = ${input.questionId}
        for update of q
      `;

      if (!question) throw new AppError('QUESTION_LOCKED');

      await ensureParticipant(tx, question.season_id, viewer.profileId);

      if (question.status !== 'open') throw new AppError('QUESTION_LOCKED');
      if (question.matchday_status === 'closed') throw new AppError('QUESTION_LOCKED');

      const now = Date.now();
      if (new Date(question.locks_at).getTime() <= now) throw new AppError('QUESTION_LOCKED');
      if (new Date(question.closes_at).getTime() <= now) throw new AppError('QUESTION_LOCKED');

      const options = parseOptions(question.options);
      if (!options.some((option) => option.key === input.choice)) {
        throw new AppError('QUESTION_LOCKED', 'Такого варианта нет в вопросе');
      }

      await tx`
        insert into answers (question_id, profile_id, choice, submitted_at)
        values (${question.id}, ${viewer.profileId}, ${input.choice}, now())
        on conflict (question_id, profile_id)
        do update set choice = excluded.choice, submitted_at = now()
      `;
    });

    revalidateGame();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export type MatchdayPredictionsActionResult =
  | { ok: true; data: NonNullable<Awaited<ReturnType<typeof loadMatchdayPredictions>>> }
  | { ok: false; message: string };

export async function loadMatchdayPredictionsAction(matchdayId: string): Promise<MatchdayPredictionsActionResult> {
  if (!matchdayId) return { ok: false, message: 'Не указан игровой день' };
  if (!hasDatabase()) {
    return { ok: false, message: 'Просмотр прошлых дней доступен после подключения базы данных.' };
  }
  try {
    const data = await loadMatchdayPredictions(matchdayId);
    if (!data) return { ok: false, message: 'Игровой день не найден.' };
    return { ok: true, data };
  } catch (error) {
    console.error('loadMatchdayPredictionsAction:', error);
    return { ok: false, message: 'Не удалось загрузить данные дня.' };
  }
}


