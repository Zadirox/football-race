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
import { hasDatabase } from '@/lib/env';
import { type DiceTier } from '@/lib/game/dice';
import {
  applyLocker,
  applyPassage,
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
import { parseOptions } from '@/lib/repo/mappers';

export type ActionResult =
  | { ok: true; redirectTo?: string }
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

    await db().begin(async (tx) => {
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
      if (repeated) return;

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
        `${ctx.nickname} бросает ${TIER_LABEL[tier]} кубик: ${plan.value}`,
      );

      if (plan.needsTactics) {
        // Тактика решается на этом же броске: позицию не трогаем,
        // сохраняем только списанные Трибуны/Газон.
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
        return;
      }

      await moveAndResolve(tx, ctx, plan.state, plan.value, roll.id);
    });

    revalidateGame();
    return { ok: true };
  } catch (error) {
    // Здесь единственный unique-конфликт — повторный ключ идемпотентности:
    // бросок уже учтён, второй раз двигать нельзя, но и ошибку показывать не надо.
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


