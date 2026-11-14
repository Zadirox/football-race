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
import type {
  DiceGrantInput,
  LineupBonusManualInput,
  MatchUpdateInput,
  PackGrantInput,
  PendingCloseInput,
  RoleChangeInput,
} from '@/lib/actions/admin-schemas';
import { db } from '@/lib/db';
import { hasDatabase } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { LINEUP_POINTS, type CardRarity } from '@/lib/game/cards';
import { DICE_SIDES } from '@/lib/game/dice';
import { expiryDecision, isExpirableKind } from '@/lib/game/pending-expiry';
import { getActiveNationalPack, grantNationalPack, NATIONAL_PACK_ID } from '@/lib/repo/cards';
import { lockAnyPending, lockPlayer } from '@/lib/repo/game-tx';
import { applyExpiryDecision } from '@/lib/repo/pending';

export type AdminPendingView = {
  id: string;
  nickname: string;
  kind: string;
  expiresAt: string;
};

const PENDING_LIMIT = 50;

export type AdminManualLineupSlotView = {
  slotId: string;
  profileId: string;
  nickname: string;
  matchId: string;
  kickoffAt: string;
  matchStatus: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string | null;
  awayTeamShortName: string | null;
  slot: 'GK' | 'OF1' | 'OF2';
  cardName: string;
  cardTeamName: string | null;
  roleGroup: 'GK' | 'MID' | 'FWD';
  rarity: CardRarity;
  rating: number;
  points: number;
  awarded: boolean;
  method: 'auto' | 'manual' | null;
};

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

function toIsoDate(value: string | Date | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function toNum(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Ручная выдача паков сборных игроку активного сезона (один грант = один пак). */
export async function grantPackToProfile(actorId: string, input: PackGrantInput): Promise<void> {
  const sql = db();

  await sql.begin(async (tx) => {
    const [profile] = await tx<{ id: string }[]>`
      select id from profiles where id = ${input.profileId} limit 1
    `;
    if (!profile) throw new AppError('PLAYER_NOT_IN_SEASON', 'Игрок не найден');

    const [season] = await tx<{ id: string }[]>`
      select id from seasons
       where status = 'active'
       order by starts_on desc
       limit 1
    `;
    if (!season) throw new AppError('CONFIG_MISSING', 'Нет активного сезона');

    const [member] = await tx<{ profile_id: string }[]>`
      select profile_id
        from season_players
       where season_id = ${season.id} and profile_id = ${input.profileId}
       limit 1
    `;
    if (!member) {
      throw new AppError('PLAYER_NOT_IN_SEASON', 'Игрок не участвует в активном сезоне');
    }

    const client = tx as unknown as ReturnType<typeof db>;
    const pack = await getActiveNationalPack(season.id, client);
    if (!pack) {
      throw new AppError('CONFIG_MISSING', 'Активный пак сборных не найден');
    }

    const grantedIds: string[] = [];
    for (let i = 0; i < input.count; i += 1) {
      const grant = await grantNationalPack(
        {
          seasonId: season.id,
          profileId: input.profileId,
          packId: pack.id ?? NATIONAL_PACK_ID,
          source: 'admin',
          grantIndex: i + 1,
        },
        client,
      );
      if (grant?.id) grantedIds.push(grant.id);
    }

    await audit(tx, actorId, 'pack.grant', 'profile', input.profileId, null, {
      seasonId: season.id,
      packId: pack.id,
      count: input.count,
      grantIds: grantedIds,
    });
  });
}

/** Ручной бонус состава (FWD/MID/GK) с идемпотентной записью результата и score_events. */
export async function awardManualLineupBonus(
  actorId: string,
  input: LineupBonusManualInput,
): Promise<void> {
  const sql = db();

  await sql.begin(async (tx) => {
    const [slot] = await tx<
      {
        id: string;
        season_id: string;
        match_id: string;
        profile_id: string;
        card_instance_id: string;
        match_status: string;
        kickoff_at: string | Date;
        role_group: string | null;
        rarity: CardRarity | null;
      }[]
    >`
      select ls.id,
             ls.season_id,
             ls.match_id,
             ls.profile_id,
             ls.card_instance_id,
             m.status as match_status,
             m.kickoff_at,
             c.role_group,
             c.rarity
        from lineup_slots ls
        join matches m on m.id = ls.match_id
        join card_instances ci on ci.id = ls.card_instance_id
        join cards c on c.id = ci.card_id
       where ls.id = ${input.lineupSlotId}
       for update of ls
    `;

    if (!slot) throw new AppError('NOT_FOUND', 'Слот состава не найден');

    const role = slot.role_group;
    if (role !== 'GK' && role !== 'MID' && role !== 'FWD') {
      throw new AppError('INVALID_INPUT', 'Ручной бонус доступен только для вратаря, полузащитника или нападающего');
    }

    if (slot.match_status !== 'FT') {
      throw new AppError('EVENT_NOT_CHOOSABLE', 'Бонус можно начислить только после финального свистка (FT)');
    }

    const kickoffMs = new Date(slot.kickoff_at).getTime();
    if (!Number.isFinite(kickoffMs) || kickoffMs > Date.now()) {
      throw new AppError('EVENT_NOT_CHOOSABLE', 'Матч ещё не начался');
    }

    if (!slot.rarity || !(slot.rarity in LINEUP_POINTS)) {
      throw new AppError('CONFIG_MISSING', 'Не удалось определить редкость карточки');
    }

    const rarity = slot.rarity as CardRarity;
    const points = LINEUP_POINTS[rarity];
    const refTable = 'lineup_slot';
    const refId = slot.id;

    const [before] = await tx<
      { awarded: boolean; points: number | string; method: string; rarity: string }[]
    >`
      select awarded, points, method, rarity
        from lineup_card_results
       where lineup_slot_id = ${slot.id}
       limit 1
    `;

    if (input.triggered) {
      await tx`
        insert into lineup_card_results (
          lineup_slot_id, profile_id, match_id, card_instance_id,
          rarity, points, awarded, method, awarded_at, awarded_by, reason
        )
        values (
          ${slot.id}, ${slot.profile_id}, ${slot.match_id}, ${slot.card_instance_id},
          ${rarity}, ${points}, true, 'manual', now(), ${actorId}, 'manual_award'
        )
        on conflict (lineup_slot_id)
        do update set
          profile_id = excluded.profile_id,
          match_id = excluded.match_id,
          card_instance_id = excluded.card_instance_id,
          rarity = excluded.rarity,
          points = excluded.points,
          awarded = true,
          method = 'manual',
          awarded_at = now(),
          awarded_by = ${actorId},
          reason = 'manual_award'
      `;

      await tx`
        insert into score_events (season_id, profile_id, kind, points, ref_table, ref_id)
        values (${slot.season_id}, ${slot.profile_id}, 'lineup_bonus', ${points}, ${refTable}, ${refId})
        on conflict (season_id, profile_id, kind, ref_table, ref_id)
        do update set points = excluded.points
      `;
    } else {
      await tx`
        insert into lineup_card_results (
          lineup_slot_id, profile_id, match_id, card_instance_id,
          rarity, points, awarded, method, awarded_at, awarded_by, reason
        )
        values (
          ${slot.id}, ${slot.profile_id}, ${slot.match_id}, ${slot.card_instance_id},
          ${rarity}, ${points}, false, 'manual', null, null, 'manual_revoke'
        )
        on conflict (lineup_slot_id)
        do update set
          profile_id = excluded.profile_id,
          match_id = excluded.match_id,
          card_instance_id = excluded.card_instance_id,
          rarity = excluded.rarity,
          points = 0,
          awarded = false,
          method = 'manual',
          awarded_at = null,
          awarded_by = null,
          reason = 'manual_revoke'
      `;

      await tx`
        delete from score_events
         where season_id = ${slot.season_id}
           and profile_id = ${slot.profile_id}
           and kind = 'lineup_bonus'
           and ref_table = ${refTable}
           and ref_id = ${refId}
      `;
    }

    const [after] = await tx<{ awarded: boolean; points: number | string; method: string }[]>`
      select awarded, points, method
        from lineup_card_results
       where lineup_slot_id = ${slot.id}
       limit 1
    `;

    await audit(tx, actorId, 'lineup_bonus.manual', 'lineup_slot', slot.id, before ?? null, {
      triggered: input.triggered,
      rarity,
      points: input.triggered ? points : 0,
      scoreEvent: input.triggered ? { kind: 'lineup_bonus', refTable, refId, points } : { removed: true, kind: 'lineup_bonus', refTable, refId },
      result: after ?? null,
    });
  });
}

/** Слоты состава для ручного бонуса: только FWD/MID/GK, матчи FT, с текущим состоянием награды. */
export async function listManualLineupBonusSlots(): Promise<AdminManualLineupSlotView[]> {
  if (!hasDatabase()) return [];

  const sql = db();
  const rows = await sql<
    {
      slot_id: string;
      profile_id: string;
      nickname: string;
      match_id: string;
      kickoff_at: string | Date;
      match_status: string;
      home_team_name: string;
      away_team_name: string;
      home_team_short_name: string | null;
      away_team_short_name: string | null;
      slot: 'GK' | 'OF1' | 'OF2';
      card_name: string;
      card_team_name: string | null;
      role_group: 'GK' | 'MID' | 'FWD';
      rarity: CardRarity;
      rating: number | string | null;
      awarded: boolean | null;
      result_points: number | string | null;
      method: 'auto' | 'manual' | null;
    }[]
  >`
    select ls.id as slot_id,
           ls.profile_id,
           pr.nickname,
           ls.match_id,
           m.kickoff_at,
           m.status as match_status,
           ht.name as home_team_name,
           at.name as away_team_name,
           ht.short_name as home_team_short_name,
           at.short_name as away_team_short_name,
           ls.slot,
           c.player_name as card_name,
           nt.name as card_team_name,
           c.role_group,
           c.rarity,
           c.rating,
           lcr.awarded,
           lcr.points as result_points,
           lcr.method
      from lineup_slots ls
      join profiles pr on pr.id = ls.profile_id
      join matches m on m.id = ls.match_id
      join teams ht on ht.id = m.home_team_id
      join teams at on at.id = m.away_team_id
      join card_instances ci on ci.id = ls.card_instance_id
      join cards c on c.id = ci.card_id
      left join national_teams nt on nt.id = c.national_team_id
      left join lineup_card_results lcr on lcr.lineup_slot_id = ls.id
     where m.status = 'FT'
       and c.role_group in ('GK', 'MID', 'FWD')
     order by m.kickoff_at desc, pr.nickname asc, ls.slot asc
     limit 200
  `;

  return rows.map((row) => {
    const rarity = row.rarity as CardRarity;
    const basePoints = LINEUP_POINTS[rarity] ?? 0;
    const awarded = row.awarded === true;
    return {
      slotId: row.slot_id,
      profileId: row.profile_id,
      nickname: row.nickname,
      matchId: row.match_id,
      kickoffAt: toIsoDate(row.kickoff_at),
      matchStatus: row.match_status,
      homeTeamName: row.home_team_name,
      awayTeamName: row.away_team_name,
      homeTeamShortName: row.home_team_short_name,
      awayTeamShortName: row.away_team_short_name,
      slot: row.slot,
      cardName: row.card_name,
      cardTeamName: row.card_team_name,
      roleGroup: row.role_group,
      rarity,
      rating: toNum(row.rating),
      points: awarded ? toNum(row.result_points) || basePoints : basePoints,
      awarded,
      method: row.method,
    };
  });
}
