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
  applyLastMinute,
  applyLocker,
  applyPassage,
  applyPenalty,
  applyRedVar,
  applySuperSub,
  applyVar,
  applyRematchKick,
  applyTrainingShot,
  initialRematchState,
  initialTrainingBaseState,
  isGuessCorrect,
  makePlayer,
  moveBy,
  resolveGentleman,
  resolveSimulation,
  trainingBaseReward,
  guessPlayerReward,
  type EffectCode,
  type GentlemanChoice,
  type RematchDirection,
  type SimulationChoice,
  type JudgeChoice,
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
  /** �?�?�?�>�?���? �?�?�?��?�?�> �� �?�� ��>��'���/�?�?�+�<�'��? (��?�>�� �?�?�+�<�'��� �?�?�?�?��ؐ�?�>�?�?�?). */
  to?: number;
  /** �?���?���?��� �?�<�+�?�?�� ���?�?�>�� �?�?�+�<�'��?, ��?�>�� ��?�'�? �?�?�?��?�?�> �?�?. */
  awaiting?: string | null;
  /** �����'��? �?�?�+�<�'��? �?�� ��>��'��?. */
  eventText?: string | null;
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
           and (payload->>'waiting') is distinct from 'true'
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
          ${tx.json({ tribuny: ctx.effects.some((e) => e.code === 'tribuny'), gazon: ctx.effects.some((e) => e.code === 'gazon'), tactics: plan.needsTactics, cursedBoot: plan.cursedBoot })},
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
        `${ctx.nickname} бросил ${TIER_LABEL[tier]} кубик: ${plan.value}${plan.cursedBoot ? ' (проклятая бутса)' : ''}`,
      );

      const info: RollResult = {
        base: plan.base,
        value: plan.value,
        tier,
        from: ctx.position,
        needsTactics: plan.needsTactics,
        to: ctx.position,
        awaiting: plan.needsTactics ? 'tactics' : null,
        eventText: null,
      };

      if (plan.needsTactics) {
        await persistState(tx, ctx, plan.state);
        await tx`
          insert into pending_actions (season_id, profile_id, kind, payload)
          values (
            ${matchday.season_id},
            ${viewer.profileId},
            'tactics',
            ${tx.json({ rollId: roll.id, value: plan.value, base: plan.base, tier, from: ctx.position, cursedBoot: plan.cursedBoot })}
          )
        `;
        return info;
      }

      if (plan.cursedBoot) {
        await persistState(tx, ctx, plan.state);
        const opponents = await tx<Array<{ profile_id: string; position: number; nickname: string }>>`
          select sp.profile_id, sp.position, p.nickname
            from season_players sp
            join profiles p on p.id = sp.profile_id
           where sp.season_id = ${matchday.season_id}
             and sp.profile_id <> ${viewer.profileId}
             and sp.is_active = true
             and sp.finished_at is null
        `;
        if (opponents.length === 0) {
          const next = moveBy(makePlayer(ctx.position, plan.state.effects), 1);
          await persistState(tx, ctx, next);
          await logActivity(tx, matchday.season_id, viewer.profileId, 'positive', `Проклятая бутса: соперников нет, ${ctx.nickname} получает +1 клетку.`);
        } else {
          const target = opponents[Math.floor(Math.random() * opponents.length)]!;
          const newPos = Math.max(1, Math.min(LAST_CELL, target.position + plan.value));
          await tx`
            update season_players
               set position = ${newPos},
                   finished_at = case when ${newPos} >= ${LAST_CELL} and finished_at is null then now() else finished_at end
             where season_id = ${matchday.season_id}
               and profile_id = ${target.profile_id}
          `;
          await logActivity(tx, matchday.season_id, target.profile_id, 'neutral', `Проклятая бутса: бросок ${ctx.nickname} (${plan.value}) сдвинул ${target.nickname} на ${plan.value} клеток.`);
        }
        await tx`update rolls set state = 'resolved', to_position = ${ctx.position} where id = ${roll.id}`;
        return info;
      }

      const moveResult = await moveAndResolve(tx, ctx, plan.state, plan.value, roll.id);
      return {
        ...info,
        to: moveResult.state.position,
        awaiting: moveResult.awaiting,
        eventText: moveResult.log,
      };
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
      const cursedBoot = pending.payload.cursedBoot === true;
      if (cursedBoot) {
        await persistState(tx, ctx, choice.state);
        const opponents = await tx<Array<{ profile_id: string; position: number; nickname: string }>>`
          select sp.profile_id, sp.position, p.nickname
            from season_players sp
            join profiles p on p.id = sp.profile_id
           where sp.season_id = ${pending.season_id}
             and sp.profile_id <> ${viewer.profileId}
             and sp.is_active = true
             and sp.finished_at is null
        `;
        if (opponents.length === 0) {
          const next = moveBy(makePlayer(ctx.position, choice.state.effects), 1);
          await persistState(tx, ctx, next);
          await logActivity(tx, pending.season_id, viewer.profileId, 'positive', `Проклятая бутса: соперников нет, ${ctx.nickname} получает +1 клетку.`);
        } else {
          const target = opponents[Math.floor(Math.random() * opponents.length)]!;
          const newPos = Math.max(1, Math.min(LAST_CELL, target.position + choice.value));
          await tx`
            update season_players
               set position = ${newPos},
                   finished_at = case when ${newPos} >= ${LAST_CELL} and finished_at is null then now() else finished_at end
             where season_id = ${pending.season_id}
               and profile_id = ${target.profile_id}
          `;
          await logActivity(tx, pending.season_id, target.profile_id, 'neutral', `Проклятая бутса: бросок ${ctx.nickname} (${choice.value}) сдвинул ${target.nickname} на ${choice.value} клеток.`);
        }
        await tx`update rolls set state = 'resolved', to_position = ${ctx.position} where id = ${roll.id}`;
      } else {
        await moveAndResolve(tx, ctx, choice.state, choice.value, roll.id);
      }

      await logActivity(
        tx,
        pending.season_id,
        viewer.profileId,
        'neutral',
        choice.delta === 0
          ? 'Тактическая схема: оставляем как есть.'
          : `Тактическая схема: ${choice.delta > 0 ? 'плюс' : 'минус'} один к броску.`,
      );

      await closePending(tx, pending, { choice: choice.delta, cursedBoot });
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

export async function chooseLastMinuteAction(input: {
  pendingId: string;
  choice: 'stop' | 'continue';
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  if (input.choice !== 'stop' && input.choice !== 'continue') return toResult(new AppError('INVALID_INPUT'));

  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'last_minute');

      const stageRaw = pending.payload.stage;
      const rewardRaw = pending.payload.currentReward;
      const stage = stageRaw === 1 || stageRaw === 2 ? stageRaw : null;
      const currentReward = rewardRaw === 1 || rewardRaw === 3 ? rewardRaw : null;
      if (!stage || !currentReward || (stage === 1 && currentReward !== 1) || (stage === 2 && currentReward !== 3)) {
        throw new AppError('EVENT_NOT_CHOOSABLE');
      }

      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      const res = applyLastMinute(makePlayer(ctx.position, ctx.effects), input.choice, stage, currentReward);

      if (!res.done) {
        await tx`
          update pending_actions
             set payload = ${tx.json({ stage: res.stage, currentReward: res.currentReward })}
           where id = ${pending.id}
        `;
        if (pending.event_id) {
          await tx`
            update cell_events
               set outcome = coalesce(outcome, '{}'::jsonb) || ${tx.json({ stage: res.stage, currentReward: res.currentReward })}::jsonb
             where id = ${pending.event_id}
          `;
        }
        await logActivity(tx, pending.season_id, viewer.profileId, 'neutral', res.log);
        return;
      }

      await persistState(tx, ctx, res.outcome.state);
      await logActivity(
        tx,
        pending.season_id,
        viewer.profileId,
        res.outcome.delta >= 0 ? 'positive' : 'neutral',
        res.outcome.log,
      );
      await closePending(tx, pending, {
        choice: input.choice,
        stage,
        currentReward,
        delta: res.outcome.delta,
      });
    });

    revalidateGame();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

// ---------- партнёрские механики (14/16/18) ----------

type PendingDbRowLocal = { id: string; season_id: string; profile_id: string; event_id: string | null; kind: string; payload: unknown; expires_at: string | Date; resolved_at: string | Date | null };
type PartnerKind = 'rematch' | 'simulation' | 'gentleman';
const PARTNER_KINDS: readonly PartnerKind[] = ['rematch', 'simulation', 'gentleman'];

function isPartnerKind(kind: string): kind is PartnerKind {
  return (PARTNER_KINDS as readonly string[]).includes(kind);
}

export async function choosePartnerInviteAction(input: {
  pendingId: string;
  targetProfileId: string | null;
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      if (!isPartnerKind(pending.kind)) throw new AppError('EVENT_NOT_CHOOSABLE');
      const phase = pending.payload.phase;
      if (phase !== 'pick_partner') throw new AppError('EVENT_NOT_CHOOSABLE');

      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);

      // Decline / no partner
      if (!input.targetProfileId) {
        await logActivity(tx, pending.season_id, viewer.profileId, 'neutral', `${ctx.nickname} не выбрал партнёра: событие закрыто без штрафа.`);
        await closePending(tx, pending, { cancelled: 'no_partner' });
        return;
      }

      if (input.targetProfileId === viewer.profileId) throw new AppError('INVALID_INPUT', 'Нельзя выбрать себя');

      const [target] = await tx<Array<{ profile_id: string; nickname: string }>>`
        select sp.profile_id, p.nickname
          from season_players sp
          join profiles p on p.id = sp.profile_id
         where sp.season_id = ${pending.season_id}
           and sp.profile_id = ${input.targetProfileId}
           and sp.is_active = true
           and sp.finished_at is null
         limit 1
      `;
      if (!target) throw new AppError('INVALID_INPUT', 'Партнёр недоступен');

      // Partner must not have a blocking pending
      const [partnerBlocking] = await tx<{ id: string }[]>`
        select id from pending_actions
         where season_id = ${pending.season_id}
           and profile_id = ${input.targetProfileId}
           and resolved_at is null
           and expires_at > now()
           and (payload->>'waiting') is distinct from 'true'
         limit 1
      `;
      if (partnerBlocking) throw new AppError('INVALID_INPUT', 'У этого игрока уже есть активное событие');

      // Initiator pending becomes waiting
      await tx`
        update pending_actions
           set payload = ${tx.json({ phase: 'waiting_partner', initiatorId: viewer.profileId, partnerId: input.targetProfileId, waiting: true })}
         where id = ${pending.id}
      `;

      // Partner gets response pending
      await tx`
        insert into pending_actions (season_id, profile_id, event_id, kind, payload, required_profile_id)
        values (
          ${pending.season_id},
          ${input.targetProfileId},
          ${pending.event_id},
          ${pending.kind},
          ${tx.json({ phase: 'partner_response', initiatorId: viewer.profileId, partnerId: input.targetProfileId, waiting: false })},
          ${input.targetProfileId}
        )
      `;

      if (pending.event_id) {
        await tx`
          update cell_events
             set state = 'awaiting_other',
                 outcome = coalesce(outcome, '{}'::jsonb) || ${tx.json({ partnerId: input.targetProfileId, partnerNickname: target.nickname })}::jsonb
           where id = ${pending.event_id}
        `;
      }

      await logActivity(tx, pending.season_id, viewer.profileId, 'neutral', `${ctx.nickname} вызвал ${target.nickname} на «${pending.kind === 'rematch' ? 'Ответный матч' : pending.kind === 'simulation' ? 'Симуляцию' : 'Джентльменское соглашение'}».`);
    });
    revalidateGame();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function respondPartnerInviteAction(input: {
  pendingId: string;
  accept: boolean;
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      if (!isPartnerKind(pending.kind)) throw new AppError('EVENT_NOT_CHOOSABLE');
      if (pending.payload.phase !== 'partner_response') throw new AppError('EVENT_NOT_CHOOSABLE');

      const initiatorId = typeof pending.payload.initiatorId === 'string' ? pending.payload.initiatorId : null;
      const partnerId = viewer.profileId;
      if (!initiatorId) throw new AppError('EVENT_NOT_CHOOSABLE');

      const [initiatorPending] = await tx<PendingDbRowLocal[]>`
        select id, season_id, profile_id, event_id, kind, payload, expires_at, resolved_at
          from pending_actions
         where event_id = ${pending.event_id}
           and profile_id = ${initiatorId}
           and resolved_at is null
         for update
      `;

      const ctx = await lockPlayer(tx, pending.season_id, partnerId);

      if (!input.accept) {
        // Decline: close all, no penalty
        await tx`update pending_actions set resolved_at = now() where event_id = ${pending.event_id} and resolved_at is null`;
        if (pending.event_id) {
          await tx`
            update cell_events
               set state = 'resolved', resolved_at = now(),
                   outcome = coalesce(outcome, '{}'::jsonb) || ${tx.json({ cancelled: 'declined', declinedBy: partnerId })}::jsonb
             where id = ${pending.event_id}
          `;
        }
        await logActivity(tx, pending.season_id, partnerId, 'neutral', `${ctx.nickname} отказался от дуэли. Штрафа нет.`);
        return;
      }

      // Accept: both become active secret_choice / shootout
      const nextPhase = pending.kind === 'rematch' ? 'shootout' : 'secret_choice';
      const basePayload = {
        phase: nextPhase,
        initiatorId,
        partnerId,
        waiting: false,
        ...(pending.kind === 'rematch' ? { rematch: initialRematchState() } : {}),
      };

      await tx`
        update pending_actions
           set payload = ${tx.json(basePayload as any)}, required_profile_id = ${partnerId}
         where id = ${pending.id}
      `;
      if (initiatorPending) {
        await tx`
          update pending_actions
             set payload = ${tx.json(basePayload as any)}, required_profile_id = ${initiatorId}
           where id = ${initiatorPending.id}
        `;
      }

      if (pending.event_id) {
        await tx`
          update cell_events
             set state = 'awaiting_choice',
                 outcome = coalesce(outcome, '{}'::jsonb) || ${tx.json({ accepted: true, phase: nextPhase })}::jsonb
           where id = ${pending.event_id}
        `;
      }

      await logActivity(tx, pending.season_id, partnerId, 'neutral', `${ctx.nickname} принял вызов. Дуэль начинается.`);
    });
    revalidateGame();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function submitPartnerChoiceAction(input: {
  pendingId: string;
  choice: string;
}): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      if (!isPartnerKind(pending.kind)) throw new AppError('EVENT_NOT_CHOOSABLE');
      if (pending.payload.waiting === true) throw new AppError('EVENT_NOT_CHOOSABLE');

      const phase = pending.payload.phase;
      const initiatorId = typeof pending.payload.initiatorId === 'string' ? pending.payload.initiatorId : null;
      const partnerId = typeof pending.payload.partnerId === 'string' ? pending.payload.partnerId : null;
      if (!initiatorId || !partnerId) throw new AppError('EVENT_NOT_CHOOSABLE');

      const [other] = await tx<PendingDbRowLocal[]>`
        select id, season_id, profile_id, event_id, kind, payload, expires_at, resolved_at
          from pending_actions
         where event_id = ${pending.event_id}
           and profile_id <> ${viewer.profileId}
           and resolved_at is null
         for update
      `;

      if (pending.kind === 'rematch') {
        if (phase !== 'shootout') throw new AppError('EVENT_NOT_CHOOSABLE');
        const dir = input.choice;
        if (dir !== 'left' && dir !== 'center' && dir !== 'right') throw new AppError('INVALID_INPUT');
        const pick = dir as RematchDirection;
        const rematch = (pending.payload.rematch as any) ?? initialRematchState();
        const myKey = viewer.profileId === initiatorId ? 'initiatorPick' : 'partnerPick';
        const otherKey = myKey === 'initiatorPick' ? 'partnerPick' : 'initiatorPick';

        // Store my pick in both pendings payload for simplicity
        const myPayload = { ...pending.payload, [myKey]: pick, waiting: true };
        const otherPayload = other ? { ...(other.payload as Record<string, unknown>), [myKey]: pick } : null;

        const otherPick = (pending.payload[otherKey] as RematchDirection | undefined) ?? (other?.payload as any)?.[otherKey];
        if (!otherPick) {
          // wait for other
          await tx`update pending_actions set payload = ${tx.json(myPayload as any)} where id = ${pending.id}`;
          if (other) await tx`update pending_actions set payload = ${tx.json({ ...otherPayload, waiting: false } as any)} where id = ${other.id}`;
          await logActivity(tx, pending.season_id, viewer.profileId, 'neutral', `Серия пенальти: выбор сделан, ждём соперника.`);
          return;
        }

        // both picked - resolve kick
        const initiatorPick = myKey === 'initiatorPick' ? pick : (otherPick as RematchDirection);
        const partnerPick = myKey === 'partnerPick' ? pick : (otherPick as RematchDirection);
        const next = applyRematchKick(rematch, initiatorPick, partnerPick);

        if (!next.done) {
          const nextPayload = { phase: 'shootout', initiatorId, partnerId, waiting: false, rematch: next };
          await tx`update pending_actions set payload = ${tx.json(nextPayload as any)} where id = ${pending.id}`;
          if (other) await tx`update pending_actions set payload = ${tx.json(nextPayload as any)} where id = ${other.id}`;
          const last = next.kicks[next.kicks.length - 1];
          await logActivity(tx, pending.season_id, viewer.profileId, 'neutral', `Серия пенальти: раунд ${last?.round ?? '?'}, ${last?.goal ? 'гол!' : 'сейв/мимо'}. Счёт ${next.initiatorScore}:${next.partnerScore}.`);
          return;
        }

        // done
        const winnerId = next.winner === 'initiator' ? initiatorId : partnerId;
        const loserId = next.winner === 'initiator' ? partnerId : initiatorId;
        const [winnerCtx, loserCtx] = await Promise.all([lockPlayer(tx, pending.season_id, winnerId), lockPlayer(tx, pending.season_id, loserId)]);
        const winnerState = moveBy(makePlayer(winnerCtx.position, winnerCtx.effects), 3);
        await persistState(tx, winnerCtx, winnerState);
        // loser gets 0 (no penalty) - per spec "проигравшему ничего"
        await logActivity(tx, pending.season_id, winnerId, 'positive', `Ответный матч: победа ${winnerCtx.nickname}! Счёт ${next.initiatorScore}:${next.partnerScore}, +3 клетки.`);
        await logActivity(tx, pending.season_id, loserId, 'neutral', `Ответный матч: ${loserCtx.nickname} уступил. Счёт ${next.initiatorScore}:${next.partnerScore}, без штрафа.`);
        await tx`update pending_actions set resolved_at = now() where event_id = ${pending.event_id} and resolved_at is null`;
        if (pending.event_id) {
          await tx`update cell_events set state='resolved', resolved_at=now(), outcome=coalesce(outcome,'{}'::jsonb)||${tx.json({ rematch: next })}::jsonb where id=${pending.event_id}`;
        }
        return;
      }

      if (phase !== 'secret_choice') throw new AppError('EVENT_NOT_CHOOSABLE');

      // simulation / gentleman
      const isInitiator = viewer.profileId === initiatorId;
      const myChoiceKey = isInitiator ? 'initiatorChoice' : 'partnerChoice';
      const otherChoiceKey = isInitiator ? 'partnerChoice' : 'initiatorChoice';

      // validate choice
      if (pending.kind === 'simulation') {
        const ok = isInitiator ? (input.choice === 'honest' || input.choice === 'simulate') : (input.choice === 'play_on' || input.choice === 'check');
        if (!ok) throw new AppError('INVALID_INPUT');
      } else {
        if (input.choice !== 'cooperate' && input.choice !== 'take') throw new AppError('INVALID_INPUT');
      }

      const otherChoice = (pending.payload[otherChoiceKey] as string | undefined) ?? (other?.payload as any)?.[otherChoiceKey];
      const myPayload = { ...pending.payload, [myChoiceKey]: input.choice, waiting: true };
      const otherPayload = other ? { ...(other.payload as Record<string, unknown>), [myChoiceKey]: input.choice, waiting: false } : null;

      if (!otherChoice) {
        await tx`update pending_actions set payload = ${tx.json(myPayload as any)} where id = ${pending.id}`;
        if (other) await tx`update pending_actions set payload = ${tx.json({ ...otherPayload, waiting: false } as any)} where id = ${other.id}`;
        await logActivity(tx, pending.season_id, viewer.profileId, 'neutral', `Выбор сделан. Ждём соперника.`);
        return;
      }

      // both chosen - resolve
      const initiatorChoice = (isInitiator ? input.choice : otherChoice) as string;
      const partnerChoice = (isInitiator ? otherChoice : input.choice) as string;
      const [iCtx, pCtx] = await Promise.all([lockPlayer(tx, pending.season_id, initiatorId), lockPlayer(tx, pending.season_id, partnerId)]);

      let iDelta = 0; let pDelta = 0; let log = '';
      if (pending.kind === 'simulation') {
        const res = resolveSimulation(initiatorChoice as SimulationChoice, partnerChoice as JudgeChoice);
        iDelta = res.attackerDelta; pDelta = res.judgeDelta; log = res.log;
      } else {
        const res = resolveGentleman(initiatorChoice as GentlemanChoice, partnerChoice as GentlemanChoice);
        iDelta = res.initiatorDelta; pDelta = res.partnerDelta; log = res.log;
      }

      const iState = moveBy(makePlayer(iCtx.position, iCtx.effects), iDelta);
      const pState = moveBy(makePlayer(pCtx.position, pCtx.effects), pDelta);
      await persistState(tx, iCtx, iState);
      await persistState(tx, pCtx, pState);
      await logActivity(tx, pending.season_id, null, 'neutral', log);

      await tx`update pending_actions set resolved_at = now() where event_id = ${pending.event_id} and resolved_at is null`;
      if (pending.event_id) {
        await tx`update cell_events set state='resolved', resolved_at=now(), outcome=coalesce(outcome,'{}'::jsonb)||${tx.json({ initiatorChoice, partnerChoice, iDelta, pDelta })}::jsonb where id=${pending.event_id}`;
      }
    });

    revalidateGame();
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function resolveTrainingBaseAction(input: { pendingId: string }): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'training_base');
      const round = Number(pending.payload.round ?? 1);
      const hits = Number(pending.payload.hits ?? 0);
      const shots = Array.isArray(pending.payload.shots) ? pending.payload.shots as Array<{round:number;hit:boolean}> : [];
      const done = pending.payload.done === true;
      if (done || round > 3) throw new AppError('EVENT_NOT_CHOOSABLE');

      const prev = { round, hits, shots, done: false };
      const next = applyTrainingShot(prev);
      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);

      if (!next.done) {
        await tx`update pending_actions set payload = ${tx.json(next as any)} where id = ${pending.id}`;
        const last = next.shots[next.shots.length - 1];
        await logActivity(tx, pending.season_id, viewer.profileId, 'neutral', `Тренировочная база: удар ${last?.round ?? round} — ${last?.hit ? 'попадание' : 'промах'}.`);
        return;
      }

      const reward = trainingBaseReward(next.hits);
      const finalState = reward > 0 ? moveBy(makePlayer(ctx.position, ctx.effects), reward) : makePlayer(ctx.position, ctx.effects);
      if (reward > 0) await persistState(tx, ctx, finalState);
      await logActivity(tx, pending.season_id, viewer.profileId, reward > 0 ? 'positive' : 'neutral', `Тренировочная база: ${next.hits} из 3 попаданий. ${reward > 0 ? '+2 клетки.' : 'Без награды.'}`);
      await closePending(tx, pending, { hits: next.hits, reward });
    });
    revalidateGame();
    return { ok: true };
  } catch (error) { return toResult(error); }
}

export async function revealGuessClueAction(input: { pendingId: string }): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'guess_player');
      const revealed = Number(pending.payload.revealed ?? 1);
      if (revealed >= 4) throw new AppError('EVENT_NOT_CHOOSABLE');
      await tx`update pending_actions set payload = ${tx.json({ ...pending.payload, revealed: revealed + 1 } as any)} where id = ${pending.id}`;
    });
    revalidateGame();
    return { ok: true };
  } catch (error) { return toResult(error); }
}

export async function submitGuessAnswerAction(input: { pendingId: string; answer: string }): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  const answer = String(input.answer ?? '').trim();
  if (!answer) return toResult(new AppError('INVALID_INPUT'));
  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'guess_player');
      const revealed = Number(pending.payload.revealed ?? 1);
      const acceptedAnswers = Array.isArray(pending.payload.acceptedAnswers) ? pending.payload.acceptedAnswers.map(String) : [];
      const correct = isGuessCorrect(answer, { acceptedAnswers });
      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      if (correct) {
        const reward = guessPlayerReward(revealed);
        const finalState = moveBy(makePlayer(ctx.position, ctx.effects), reward);
        await persistState(tx, ctx, finalState);
        await logActivity(tx, pending.season_id, viewer.profileId, 'positive', `Узнай футболиста: верно! Открыто подсказок: ${revealed}, награда +${reward}.`);
        await closePending(tx, pending, { correct: true, revealed, reward });
      } else {
        await logActivity(tx, pending.season_id, viewer.profileId, 'neutral', `Узнай футболиста: ответ неверный. Попытка использована.`);
        await closePending(tx, pending, { correct: false, revealed, reward: 0 });
      }
    });
    revalidateGame();
    return { ok: true };
  } catch (error) { return toResult(error); }
}

export async function submitFanSectorAction(input: { pendingId: string; submit: boolean }): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'fan_sector');
      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      if (!input.submit) {
        await logActivity(tx, pending.season_id, viewer.profileId, 'neutral', `Фан-сектор: ${ctx.nickname} пропустил задание без штрафа.`);
        await closePending(tx, pending, { submitted: false, skipped: true });
        return;
      }
      // Mark as submitted for admin review - non-blocking waiting
      await tx`update pending_actions set payload = ${tx.json({ ...pending.payload, submitted: true, waiting: true, phase: 'review' } as any)} where id = ${pending.id}`;
      if (pending.event_id) {
        await tx`update cell_events set state='awaiting_choice', outcome=coalesce(outcome,'{}'::jsonb)||${tx.json({ submitted: true, review: 'pending' })}::jsonb where id=${pending.event_id}`;
      }
      await logActivity(tx, pending.season_id, viewer.profileId, 'neutral', `Фан-сектор: ${ctx.nickname} отправил задание на проверку администратору.`);
    });
    revalidateGame();
    return { ok: true };
  } catch (error) { return toResult(error); }
}

export async function signCoachContractAction(input: { pendingId: string; sign: boolean }): Promise<ActionResult> {
  if (!hasDatabase()) return demoOnly();
  try {
    const viewer = await requireViewer();
    await db().begin(async (tx) => {
      const pending = await lockPending(tx, input.pendingId, viewer.profileId);
      requirePendingKind(pending, 'coach_contract');
      const ctx = await lockPlayer(tx, pending.season_id, viewer.profileId);
      if (!input.sign) {
        await logActivity(tx, pending.season_id, viewer.profileId, 'neutral', `Контракт тренера: ${ctx.nickname} отказался без штрафа.`);
        await closePending(tx, pending, { signed: false });
        return;
      }
      const [targetDay] = await tx<{ id: string }[]>`
        select id from matchdays
         where season_id = ${pending.season_id}
           and opens_at > now()
         order by game_date asc, opens_at asc
         limit 1
      `;
      await logActivity(tx, pending.season_id, viewer.profileId, 'positive', `Контракт тренера: ${ctx.nickname} подписал контракт на следующий игровой день.`);
      await closePending(tx, pending, { signed: true, status: 'signed', targetMatchdayId: targetDay?.id ?? null });
      if (pending.event_id) {
        await tx`update cell_events set outcome=coalesce(outcome,'{}'::jsonb)||${tx.json({ signed: true, evaluation: 'pending', targetMatchdayId: targetDay?.id ?? null } as any)}::jsonb where id=${pending.event_id}`;
      }
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


