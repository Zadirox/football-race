/**
 * Админские правки сезона (Task 14): матч, выдача кубиков, ручное закрытие
 * ожидания и смена роли.
 *
 * Правила игры здесь не живут: закрытие ожидания переиспользует те же
 * безопасные ветки, что и cron (`applyExpiryDecision`), а кубики вставляются
 * ровно теми строками, которые читает лента (`dice.source = 'admin'`).
 *
 * Каждое изменение пишет строку в `audit_log`: кто, что и каким было
 * значение до правки.
 */

import type { TransactionSql } from 'postgres';
import type { DiceGrantInput, MatchUpdateInput, PendingCloseInput, RoleChangeInput } from '@/lib/actions/admin-schemas';
import { db } from '@/lib/db';
import { hasDatabase } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { DICE_SIDES } from '@/lib/game/dice';
import { expiryDecision, isExpirableKind } from '@/lib/game/pending-expiry';
import { lockAnyPending, lockPlayer } from '@/lib/repo/game-tx';
import { applyExpiryDecision } from '@/lib/repo/pending';

export type AdminPendingView = {
  id: string;
  nickname: string;
  kind: string;
  expiresAt: string;
};

const PENDING_LIMIT = 50;

function jsonParam(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

async function audit(
  tx: TransactionSql,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx`
    insert into audit_log (actor_id, action, entity, entity_id, before, after)
    values (
      ${actorId}, ${action}, ${entity}, ${entityId},
      ${jsonParam(before)}::jsonb, ${jsonParam(after)}::jsonb
    )
  `;
}

/** Правка счёта и статуса матча: провайдер мог подвиснуть, админ решает сам. */
export async function updateMatch(actorId: string, input: MatchUpdateInput): Promise<void> {
  const sql = db();

  await sql.begin(async (tx) => {
    const [before] = await tx<
      { status: string; home_score: number | null; away_score: number | null; minute: number | null }[]
    >`
      select status, home_score, away_score, minute
        from matches
       where id = ${input.matchId}
       for update
    `;

    if (!before) throw new AppError('CONFLICT_RETRY', 'Матч не найден');

    const [after] = await tx<
      { status: string; home_score: number | null; away_score: number | null; minute: number | null }[]
    >`
      update matches
         set status = ${input.status},
             home_score = ${input.homeScore},
             away_score = ${input.awayScore},
             minute = ${input.minute},
             updated_at = now()
       where id = ${input.matchId}
       returning status, home_score, away_score, minute
    `;

    await audit(tx, actorId, 'match.update', 'match', input.matchId, before, after);
  });
}

/** Выдаёт кубики вручную: бонус за активность, компенсация сбоя и т.п. */
export async function grantDice(actorId: string, input: DiceGrantInput): Promise<void> {
  const sql = db();
  const sides = DICE_SIDES[input.tier];

  await sql.begin(async (tx) => {
    const [profile] = await tx<{ id: string }[]>`select id from profiles where id = ${input.profileId}`;
    if (!profile) throw new AppError('PLAYER_NOT_IN_SEASON', 'Игрок не найден');

    const [season] = await tx<{ id: string }[]>`
      select id from seasons
       where status = 'active'
       order by starts_on desc
       limit 1
    `;
    if (!season) throw new AppError('CONFIG_MISSING', 'Нет активного сезона');

    for (let i = 0; i < input.count; i += 1) {
      await tx`
        insert into dice (season_id, profile_id, tier, sides, source, matchday_id)
        values (${season.id}, ${input.profileId}, ${input.tier}::dice_tier, ${sides}, 'admin', null)
      `;
    }

    await audit(tx, actorId, 'dice.grant', 'profile', input.profileId, null, {
      seasonId: season.id,
      tier: input.tier,
      count: input.count,
      reason: input.reason,
    });
  });
}

/** Закрывает застрявшее ожидание безопасной веткой, не дожидаясь D7. */
export async function forceClosePending(actorId: string, input: PendingCloseInput): Promise<void> {
  const sql = db();

  await sql.begin(async (tx) => {
    const pending = await lockAnyPending(tx, input.pendingId);
    if (pending.resolved_at !== null) throw new AppError('EVENT_NOT_CHOOSABLE', 'Ожидание уже закрыто');
    if (!isExpirableKind(pending.kind)) {
      throw new AppError('EVENT_NOT_CHOOSABLE', 'Такое ожидание закрывает только сам игрок');
    }

    const ctx = await lockPlayer(tx, pending.season_id, pending.profile_id);
    const decision = expiryDecision(pending.kind, ctx.effects);
    if (!decision) throw new AppError('EVENT_NOT_CHOOSABLE');

    await applyExpiryDecision(tx, pending, ctx, decision);
    await audit(tx, actorId, 'pending.close', 'pending_action', pending.id, { kind: pending.kind }, decision);
  });
}

/** Меняет роль, но не даёт остаться без админа. */
export async function setRole(actorId: string, input: RoleChangeInput): Promise<void> {
  const sql = db();

  await sql.begin(async (tx) => {
    const [profile] = await tx<{ role: string }[]>`
      select role from profiles where id = ${input.profileId} for update
    `;
    if (!profile) throw new AppError('PLAYER_NOT_IN_SEASON', 'Игрок не найден');
    if (profile.role === input.role) return;

    if (profile.role === 'admin') {
      const [admins] = await tx<{ n: number }[]>`
        select count(*)::int as n from profiles where role = 'admin'
      `;
      if (Number(admins?.n ?? 0) <= 1) {
        throw new AppError('FORBIDDEN', 'В сезоне должен остаться хотя бы один админ');
      }
    }

    await tx`update profiles set role = ${input.role}::user_role where id = ${input.profileId}`;
    await audit(tx, actorId, 'profile.role', 'profile', input.profileId, { role: profile.role }, { role: input.role });
  });
}

/** Открытые ожидания для блока «Ожидания» в админке. */
export async function listPendingForAdmin(): Promise<AdminPendingView[]> {
  if (!hasDatabase()) return [];

  const sql = db();
  const rows = await sql<{ id: string; nickname: string; kind: string; expires_at: string | Date }[]>`
    select p.id, pr.nickname, p.kind, p.expires_at
      from pending_actions p
      join profiles pr on pr.id = p.profile_id
     where p.resolved_at is null
     order by p.expires_at asc
     limit ${PENDING_LIMIT}
  `;

  return rows.map((row) => ({
    id: row.id,
    nickname: row.nickname,
    kind: row.kind,
    expiresAt: new Date(row.expires_at).toISOString(),
  }));
}
