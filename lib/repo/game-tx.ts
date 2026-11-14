/**
 * Транзакционные помощники игры.
 *
 * Живут отдельно от server actions (`lib/actions/game.ts`), потому что из
 * модуля с `'use server'` нельзя экспортировать ничего, кроме действий.
 * Этими же функциями пользуется cron авто-закрытия ожиданий
 * (`lib/repo/pending.ts`), поэтому поведение одно и то же.
 *
 * Правило: никакой логики правил здесь нет — только блокировки строк,
 * запись позиции/эффектов и лог. Математика — в `lib/game/*`.
 */

import type { TransactionSql } from 'postgres';
import { AppError } from '@/lib/errors';
import { mechanic } from '@/lib/game/catalog';
import { landingPosition } from '@/lib/game/dice';
import {
  LAST_CELL,
  resolveCell,
  type ActiveEffect,
  type CellChoice,
  type EffectCode,
  type PlayerState,
} from '@/lib/game/engine';
import { keptEffects } from '@/lib/game/roll';
import { getActiveNationalPack, grantNationalPack } from '@/lib/repo/cards';
import type { ActivityView } from '@/lib/types';

export { LAST_CELL };

export const EFFECT_CODES: readonly EffectCode[] = ['tribuny', 'gazon', 'shieldki', 'yellow_card', 'tactics'];

export type PlayerContext = {
  seasonId: string;
  profileId: string;
  nickname: string;
  position: number;
  effects: ActiveEffect[];
};

/** Блокирует строку игрока в сезоне и собирает состояние для движка. */
export async function lockPlayer(tx: TransactionSql, seasonId: string, profileId: string): Promise<PlayerContext> {
  const [row] = await tx<{ position: number; nickname: string }[]>`
    select sp.position, p.nickname
      from season_players sp
      join profiles p on p.id = sp.profile_id
     where sp.season_id = ${seasonId}
       and sp.profile_id = ${profileId}
       and sp.is_active
       for update of sp
  `;

  if (!row) throw new AppError('PLAYER_NOT_IN_SEASON');

  const effectRows = await tx<{ code: string; charges: number | string }[]>`
    select code, charges
      from active_effects
     where season_id = ${seasonId}
       and profile_id = ${profileId}
       and charges > 0
       and (expires_at is null or expires_at > now())
  `;

  const effects: ActiveEffect[] = effectRows
    .filter((effect) => EFFECT_CODES.includes(effect.code as EffectCode))
    .map((effect) => ({ code: effect.code as EffectCode, charges: Number(effect.charges) }));

  return {
    seasonId,
    profileId,
    nickname: row.nickname,
    position: Number(row.position),
    effects,
  };
}

/** Участие в сезоне без блокировки позиции — для ответов на вопросы. */
export async function ensureParticipant(tx: TransactionSql, seasonId: string, profileId: string): Promise<void> {
  const [row] = await tx<{ one: number }[]>`
    select 1 as one
      from season_players
     where season_id = ${seasonId}
       and profile_id = ${profileId}
       and is_active
     limit 1
  `;
  if (!row) throw new AppError('PLAYER_NOT_IN_SEASON');
}

/** Позиция + эффекты: единственное место, где состояние уходит в БД. */
export async function persistState(tx: TransactionSql, ctx: PlayerContext, state: PlayerState): Promise<void> {
  await tx`
    update season_players
       set position = ${state.position},
           finished_at = case
             when ${state.position} >= ${LAST_CELL} then coalesce(finished_at, now())
             else finished_at
           end
     where season_id = ${ctx.seasonId}
       and profile_id = ${ctx.profileId}
  `;

  await tx`delete from active_effects where season_id = ${ctx.seasonId} and profile_id = ${ctx.profileId}`;

  for (const effect of keptEffects(state)) {
    await tx`
      insert into active_effects (season_id, profile_id, code, charges)
      values (${ctx.seasonId}, ${ctx.profileId}, ${effect.code}, ${effect.charges})
    `;
  }
}

export function activityKind(code: string | null): ActivityView['kind'] {
  const polarity = mechanic(code)?.polarity;
  if (polarity === 'positive') return 'positive';
  if (polarity === 'negative' || polarity === 'trap') return 'negative';
  if (code) return 'neutral';
  return 'system';
}

export async function logActivity(
  tx: TransactionSql,
  seasonId: string,
  profileId: string | null,
  kind: ActivityView['kind'],
  message: string,
): Promise<void> {
  await tx`
    insert into activity_log (season_id, profile_id, kind, message)
    values (${seasonId}, ${profileId}, ${kind}, ${message})
  `;
}

export type MoveOutcome = {
  state: PlayerState;
  eventId: string | null;
  awaiting: CellChoice | null;
  log: string;
};

/**
 * Двигает игрока, разбирает событие клетки и заводит ожидание выбора.
 * Событие новой клетки после контратаки/отката не запускается: разбор один.
 */
export async function moveAndResolve(
  tx: TransactionSql,
  ctx: PlayerContext,
  state: PlayerState,
  steps: number,
  rollId: string | null,
): Promise<MoveOutcome> {
  const to = landingPosition(state.position, steps);
  const moved: PlayerState = { ...state, position: to, finished: to >= LAST_CELL };

  const [cell] = await tx<{ mechanic_code: string | null }[]>`
    select mechanic_code
      from cells
     where season_id = ${ctx.seasonId}
       and idx = ${to}
  `;
  const code = cell?.mechanic_code ?? null;
  const outcome = resolveCell(moved, code, ctx.nickname);

  await persistState(tx, ctx, outcome.state);
  await logActivity(tx, ctx.seasonId, ctx.profileId, activityKind(code), outcome.log);

  if (rollId) {
    await tx`
      update rolls
         set to_position = ${outcome.state.position},
             state = 'moved'
       where id = ${rollId}
    `;
  }

  const [event] = await tx<{ id: string }[]>`
    insert into cell_events (
      season_id, profile_id, roll_id, cell_idx, mechanic_code, state, payload, outcome, resolved_at
    ) values (
      ${ctx.seasonId},
      ${ctx.profileId},
      ${rollId},
      ${to},
      ${code},
      ${outcome.awaiting ? 'awaiting_choice' : 'resolved'},
      ${tx.json({ steps })},
      ${tx.json({
        log: outcome.log,
        delta: outcome.delta,
        preventedBy: outcome.preventedBy,
        absorbed: outcome.absorbed,
      })},
      ${outcome.awaiting ? null : new Date()}
    )
    returning id
  `;

  if (outcome.awaiting && event) {
    await tx`
      insert into pending_actions (season_id, profile_id, event_id, kind, payload)
      values (${ctx.seasonId}, ${ctx.profileId}, ${event.id}, ${outcome.awaiting}, ${tx.json({})})
    `;
  }

  if (code === '19' && event?.id) {
    try {
      const pack = await getActiveNationalPack(ctx.seasonId, tx as never);
      if (pack) {
        await grantNationalPack(
          {
            seasonId: ctx.seasonId,
            profileId: ctx.profileId,
            packId: pack.id,
            source: 'cell',
            cellEventId: event.id,
          },
          tx as never,
        );
      } else {
        console.warn('Mechanic 19: active national pack not found; skipping grant', {
          seasonId: ctx.seasonId,
          profileId: ctx.profileId,
          eventId: event.id,
        });
      }
    } catch (error) {
      console.error('Mechanic 19: failed to grant national pack; move continues', {
        seasonId: ctx.seasonId,
        profileId: ctx.profileId,
        eventId: event.id,
        error,
      });
    }
  }

  return { state: outcome.state, eventId: event?.id ?? null, awaiting: outcome.awaiting, log: outcome.log };
}

export type PendingRow = {
  id: string;
  season_id: string;
  profile_id: string;
  event_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  expires_at: string | Date;
  resolved_at: string | Date | null;
};

type PendingDbRow = {
  id: string;
  season_id: string;
  profile_id: string;
  event_id: string | null;
  kind: string;
  payload: unknown;
  expires_at: string | Date;
  resolved_at: string | Date | null;
};

function toPendingRow(row: PendingDbRow): PendingRow {
  return {
    id: row.id,
    season_id: row.season_id,
    profile_id: row.profile_id,
    event_id: row.event_id,
    kind: row.kind,
    payload: (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>,
    expires_at: row.expires_at,
    resolved_at: row.resolved_at,
  };
}

/** Открытое ожидание решения этого игрока, заблокированное на время транзакции. */
export async function lockPending(tx: TransactionSql, pendingId: string, profileId: string): Promise<PendingRow> {
  const [row] = await tx<PendingDbRow[]>`
    select id, season_id, profile_id, event_id, kind, payload, expires_at, resolved_at
      from pending_actions
     where id = ${pendingId}
       and profile_id = ${profileId}
       for update
  `;

  if (!row || row.resolved_at !== null) throw new AppError('EVENT_NOT_CHOOSABLE');
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new AppError('EVENT_NOT_CHOOSABLE');

  return toPendingRow(row);
}

/**
 * Ожидание без проверки владельца и срока — для cron и админских действий,
 * где игрок уже не отвечает сам. Всё равно блокирует строку.
 */
export async function lockAnyPending(tx: TransactionSql, pendingId: string): Promise<PendingRow> {
  const [row] = await tx<PendingDbRow[]>`
    select id, season_id, profile_id, event_id, kind, payload, expires_at, resolved_at
      from pending_actions
     where id = ${pendingId}
       for update
  `;

  if (!row) throw new AppError('EVENT_NOT_CHOOSABLE');

  return toPendingRow(row);
}

/** Закрывает ожидание и связанное событие. */
export async function closePending(
  tx: TransactionSql,
  pending: PendingRow,
  outcome: Record<string, string | number | boolean | null>,
): Promise<void> {
  await tx`
    update pending_actions set resolved_at = now() where id = ${pending.id}
  `;

  if (pending.event_id) {
    await tx`
      update cell_events
         set state = 'resolved',
             resolved_at = now(),
             outcome = coalesce(outcome, '{}'::jsonb) || ${tx.json(outcome)}::jsonb
       where id = ${pending.event_id}
    `;
  }
}

export function requirePendingKind(pending: PendingRow, kind: string): void {
  if (pending.kind !== kind) throw new AppError('EVENT_NOT_CHOOSABLE');
}
