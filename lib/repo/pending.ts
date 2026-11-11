/**
 * Авто-закрытие брошенных ожиданий (DECISIONS D7).
 *
 * `pending_actions.expires_at` = создание + 24 часа. Cron `expire-pending`
 * каждые 15 минут применяет безопасную ветку, чтобы игрок, закрывший
 * вкладку на VAR, не блокировал себе броски навсегда.
 *
 * Логика веток — чистая (`lib/game/pending-expiry.ts`), запись — теми же
 * помощниками, что и server actions (`lib/repo/game-tx.ts`).
 */

import type { TransactionSql } from 'postgres';
import { db } from '@/lib/db';
import { hasDatabase } from '@/lib/env';
import { isAppError } from '@/lib/errors';
import { applyLocker, applyVar, makePlayer } from '@/lib/game/engine';
import { expiryDecision, expiryLog, isExpirableKind, type ExpiryDecision } from '@/lib/game/pending-expiry';
import { applyTacticsChoice } from '@/lib/game/roll';
import {
  closePending,
  lockAnyPending,
  lockPlayer,
  logActivity,
  moveAndResolve,
  persistState,
  type PendingRow,
  type PlayerContext,
} from '@/lib/repo/game-tx';

export type ExpireReport = {
  ok: boolean;
  checked: number;
  expired: number;
  skipped: number;
  errors: string[];
};

/** Сколько ожиданий разбираем за один прогон: cron ходит каждые 15 минут. */
const BATCH = 50;

/**
 * Применяет безопасную ветку к одному ожиданию внутри транзакции.
 *
 * Общая часть cron-закрытия и ручного «Закрыть безопасно» в админке:
 * правила веток одни и те же, отличается только повод.
 */
export async function applyExpiryDecision(
  tx: TransactionSql,
  pending: PendingRow,
  ctx: PlayerContext,
  decision: ExpiryDecision,
): Promise<void> {
  const state = makePlayer(ctx.position, ctx.effects);

  switch (decision.kind) {
    case 'var': {
      const varOutcome = applyVar(state, false);
      await persistState(tx, ctx, varOutcome.state);
      await logActivity(tx, pending.season_id, pending.profile_id, 'negative', expiryLog(ctx.nickname, decision));
      await closePending(tx, pending, { contest: false, auto: true, delta: varOutcome.delta });
      return;
    }

    case 'locker': {
      const lockerOutcome = applyLocker(state, decision.remove);
      await persistState(tx, ctx, lockerOutcome.state);
      await logActivity(tx, pending.season_id, pending.profile_id, 'neutral', expiryLog(ctx.nickname, decision));
      await closePending(tx, pending, { removed: decision.remove, auto: true });
      return;
    }

    case 'passage': {
      await logActivity(tx, pending.season_id, pending.profile_id, 'system', expiryLog(ctx.nickname, decision));
      await closePending(tx, pending, { given: false, auto: true });
      return;
    }

    case 'tactics': {
      const rollId = typeof pending.payload.rollId === 'string' ? pending.payload.rollId : null;
      if (!rollId) {
        await logActivity(tx, pending.season_id, pending.profile_id, 'neutral', expiryLog(ctx.nickname, decision));
        await closePending(tx, pending, { auto: true, delta: 0 });
        return;
      }

      const [roll] = await tx<{ id: string; value: number | string; state: string }[]>`
        select id, value, state from rolls where id = ${rollId} for update
      `;

      // Бросок уже уехал (или его нет): двигать нечего, просто закрываем.
      if (!roll || roll.state !== 'pending_move') {
        await logActivity(tx, pending.season_id, pending.profile_id, 'neutral', expiryLog(ctx.nickname, decision));
        await closePending(tx, pending, { auto: true, delta: 0 });
        return;
      }

      const choice = applyTacticsChoice(state, Number(roll.value), decision.delta);
      await moveAndResolve(tx, ctx, choice.state, choice.value, roll.id);
      await logActivity(tx, pending.season_id, pending.profile_id, 'neutral', expiryLog(ctx.nickname, decision));
      await closePending(tx, pending, { choice: 0, auto: true });
      return;
    }
  }
}

/**
 * Закрывает просроченные ожидания. Идемпотентно: уже закрытые строки
 * не трогаются, повторный прогон ничего не начислит второй раз.
 */
export async function expirePending(now = new Date()): Promise<ExpireReport> {
  if (!hasDatabase()) {
    return { ok: false, checked: 0, expired: 0, skipped: 0, errors: ['CONFIG_MISSING'] };
  }

  const sql = db();
  const report: ExpireReport = { ok: true, checked: 0, expired: 0, skipped: 0, errors: [] };

  const rows = await sql<{ id: string }[]>`
    select id
      from pending_actions
     where resolved_at is null
       and expires_at <= ${now}
     order by expires_at asc
     limit ${BATCH}
  `;

  for (const row of rows) {
    report.checked += 1;

    try {
      const outcome = await sql.begin(async (tx) => {
        const pending = await lockAnyPending(tx, row.id);

        // Гонка с игроком: он мог ответить между выборкой и транзакцией.
        if (pending.resolved_at !== null) return 'skipped' as const;
        if (new Date(pending.expires_at).getTime() > now.getTime()) return 'skipped' as const;
        if (!isExpirableKind(pending.kind)) return 'unknown' as const;

        const ctx = await lockPlayer(tx, pending.season_id, pending.profile_id);
        const decision = expiryDecision(pending.kind, ctx.effects);
        if (!decision) return 'unknown' as const;

        await applyExpiryDecision(tx, pending, ctx, decision);
        return 'expired' as const;
      });

      if (outcome === 'expired') report.expired += 1;
      else if (outcome === 'unknown') {
        report.skipped += 1;
        report.errors.push(`${row.id}: ожидание неизвестного типа`);
      } else {
        report.skipped += 1;
      }
    } catch (error) {
      report.skipped += 1;
      const message = isAppError(error) ? `${error.code}: ${error.message}` : (error as Error).message;
      report.errors.push(`${row.id}: ${message}`);
      console.error('Не удалось закрыть ожидание:', row.id, error);
    }
  }

  if (report.errors.length > 0) report.ok = false;
  return report;
}
