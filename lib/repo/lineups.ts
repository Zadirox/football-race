import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { canSlotCard, type LineupSlotKind } from '@/lib/game/cards';
import { teamDisplay } from '@/lib/data/team-names';
import { gameDateOf } from '@/lib/time';
import type { LineupSlotView, MatchLineupView, MatchView, OwnedCardView } from '@/lib/types';

type DbClient = ReturnType<typeof db>;

type MatchRow = {
  id: string;
  matchday_id: string;
  season_id: string;
  kickoff_utc: string | Date;
  status: string;
  home_name: string;
  away_name: string;
  home_score: number | null;
  away_score: number | null;
  league_title: string | null;
  provider: string | null;
};

type SlotRow = {
  id: string;
  match_id: string;
  matchday_id: string;
  slot: LineupSlotKind;
  card_instance_id: string;
  card_id: string;
  player_name: string;
  nationality: string | null;
  national_team_name: string | null;
  national_team_slug: string | null;
  role_group: string | null;
  rating: number | string | null;
  photo_url: string | null;
  rarity: string;
  obtained_at: string | Date;
  bonus_awarded: boolean | null;
  bonus_points: number | string | null;
  bonus_method: string | null;
};

type CardInstanceRow = {
  id: string;
  owner_id: string;
  season_id: string;
  card_id: string;
  player_name: string;
  nationality: string | null;
  role_group: string | null;
  rating: number | string | null;
  photo_url: string | null;
  rarity: string;
  national_team_id: string | null;
  national_team_name: string | null;
  national_team_slug: string | null;
};

type MatchContextRow = {
  id: string;
  season_id: string;
  matchday_id: string;
  kickoff_utc: string | Date;
  status: string;
  home_name: string;
  away_name: string;
};

const LINEUP_SLOTS: readonly LineupSlotKind[] = ['GK', 'OF1', 'OF2'];

function toIso(value: string | Date | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asRoleGroup(value: string | null): 'GK' | 'DEF' | 'MID' | 'FWD' {
  if (value === 'GK' || value === 'DEF' || value === 'MID' || value === 'FWD') return value;
  return 'MID';
}

function asRarity(value: string): 'common' | 'rare' | 'epic' | 'legend' {
  if (value === 'common' || value === 'rare' || value === 'epic' || value === 'legend') return value;
  return 'common';
}

function normalizeTeamString(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`´]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalTeamName(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  // teamDisplay maps known aliases to canonical display name (RU in this project).
  const display = teamDisplay(raw).name;
  return normalizeTeamString(display) || normalizeTeamString(raw);
}

function teamCandidates(values: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    const rawNorm = normalizeTeamString(value);
    const canon = canonicalTeamName(value);
    if (rawNorm) out.add(rawNorm);
    if (canon) out.add(canon);
  }
  out.delete('');
  return out;
}

function setsIntersect(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) if (b.has(v)) return true;
  return false;
}

/**
 * Deterministic team matcher for national cards vs match sides.
 * Fail closed: reject when no confident match or ambiguous (both sides match).
 * Uses normalized raw names and teamDisplay canonical aliases from lib/data/team-names.ts.
 * Limitations: relies on available name/slug/nationality strings; unknown aliases not in
 * team-names map may fail to match if raw strings differ materially.
 */
export function matchCardToMatchSide(params: {
  homeName: string;
  awayName: string;
  card: {
    nationalTeamName: string | null;
    nationalTeamSlug: string | null;
    nationality: string | null;
  };
}): 'home' | 'away' {
  const home = teamCandidates([params.homeName]);
  const away = teamCandidates([params.awayName]);
  const card = teamCandidates([
    params.card.nationalTeamName,
    params.card.nationality,
    params.card.nationalTeamSlug,
  ]);

  const homeMatch = setsIntersect(card, home);
  const awayMatch = setsIntersect(card, away);

  if (homeMatch && !awayMatch) return 'home';
  if (awayMatch && !homeMatch) return 'away';
  if (homeMatch && awayMatch) {
    throw new AppError('INVALID_INPUT', 'Не удалось однозначно сопоставить сборную карточки с матчем');
  }
  throw new AppError('INVALID_INPUT', 'Карточка сборной не участвует в этом матче');
}

function isLockedKickoff(kickoffUtc: string | Date): boolean {
  return Date.now() >= new Date(kickoffUtc).getTime();
}

function toMatchStatus(status: string): MatchView['status'] {
  if (
    status === 'NS' ||
    status === 'LIVE' ||
    status === 'HT' ||
    status === 'FT' ||
    status === 'PST' ||
    status === 'CANC' ||
    status === 'ABD'
  ) {
    return status;
  }
  return 'NS';
}

function mapOwnedCardFromSlot(row: SlotRow): OwnedCardView {
  return {
    id: row.card_id,
    instanceId: row.card_instance_id,
    obtainedAt: toIso(row.obtained_at),
    playerName: row.player_name,
    nationalTeam: row.national_team_name ?? row.nationality ?? '',
    nationalTeamSlug: row.national_team_slug,
    roleGroup: asRoleGroup(row.role_group),
    rating: toNumber(row.rating),
    photoUrl: row.photo_url,
    rarity: asRarity(row.rarity),
  };
}

function emptySlots(matchId: string): LineupSlotView[] {
  return LINEUP_SLOTS.map((slot) => ({ matchId, slot, card: null, bonusPoints: null, bonusAwarded: false, bonusMethod: null }));
}

export async function listLineupMatches(
  seasonId: string,
  opts?: { date?: string },
  sql: DbClient = db(),
): Promise<MatchLineupView[]> {
  const targetDate = opts?.date ?? gameDateOf(new Date());
  const rows = await sql<MatchRow[]>`
    select distinct
           m.id,
           md.id as matchday_id,
           md.season_id,
           m.kickoff_utc,
           m.status,
           m.home_name,
           m.away_name,
           m.home_score,
           m.away_score,
           m.league_title,
           m.provider
      from matchday_matches mm
      join matchdays md on md.id = mm.matchday_id
      join matches m on m.id = mm.match_id
     where md.season_id = ${seasonId}
       and md.game_date = ${targetDate}::date
     order by m.kickoff_utc asc, m.id asc
  `;

  return rows.map((row) => ({
    matchId: row.id,
    matchdayId: row.matchday_id,
    homeName: row.home_name,
    awayName: row.away_name,
    kickoffUtc: toIso(row.kickoff_utc),
    status: toMatchStatus(row.status),
    locked: isLockedKickoff(row.kickoff_utc),
    slots: emptySlots(row.id),
  }));
}

export async function getMyLineup(
  matchId: string,
  profileId: string,
  seasonId?: string,
  sql: DbClient = db(),
): Promise<LineupSlotView[]> {
  const rows = await sql<SlotRow[]>`
    select ls.id,
           ls.match_id,
           ls.matchday_id,
           ls.slot,
           ls.card_instance_id,
           c.id as card_id,
           c.player_name,
           c.nationality,
           nt.name as national_team_name,
           nt.slug as national_team_slug,
           c.role_group,
           c.rating,
           c.photo_url,
           c.rarity,
           ci.created_at as obtained_at,
           lcr.awarded as bonus_awarded,
           lcr.points as bonus_points,
           lcr.method as bonus_method
      from lineup_slots ls
      join card_instances ci on ci.id = ls.card_instance_id
      join cards c on c.id = ci.card_id
      left join national_teams nt on nt.id = c.national_team_id
      left join lineup_card_results lcr on lcr.lineup_slot_id = ls.id
     where ls.match_id = ${matchId}
       and ls.profile_id = ${profileId}
       ${seasonId ? sql`and ls.season_id = ${seasonId}` : sql``}
     order by case ls.slot when 'GK' then 1 when 'OF1' then 2 else 3 end
  `;

  const bySlot = new Map<LineupSlotKind, SlotRow>();
  for (const row of rows) bySlot.set(row.slot as LineupSlotKind, row);

  return LINEUP_SLOTS.map((slot) => {
    const row = bySlot.get(slot);
    if (!row) return { matchId, slot, card: null, bonusPoints: null, bonusAwarded: false, bonusMethod: null };
    const method = row.bonus_method === 'auto' || row.bonus_method === 'manual' ? row.bonus_method : null;
    return {
      matchId,
      slot,
      card: mapOwnedCardFromSlot(row),
      bonusAwarded: row.bonus_awarded === true,
      bonusPoints: row.bonus_points == null ? null : toNumber(row.bonus_points),
      bonusMethod: method,
    };
  });
}

export async function upsertLineupSlot(
  input: {
    profileId: string;
    matchId: string;
    slot: LineupSlotKind;
    cardInstanceId: string;
    seasonId?: string;
  },
  sql: DbClient = db(),
): Promise<LineupSlotView[]> {
  if (!LINEUP_SLOTS.includes(input.slot)) {
    throw new AppError('INVALID_INPUT', 'Недопустимый слот состава');
  }

  await sql.begin(async (tx) => {
    const client = tx as unknown as DbClient;

    const [match] = await client<MatchContextRow[]>`
      select m.id,
             mm.matchday_id,
             md.season_id,
             m.kickoff_utc,
             m.status,
             m.home_name,
             m.away_name
        from matches m
        join matchday_matches mm on mm.match_id = m.id
        join matchdays md on md.id = mm.matchday_id
       where m.id = ${input.matchId}
         ${input.seasonId ? client`and md.season_id = ${input.seasonId}` : client``}
       order by md.game_date asc, mm.matchday_id asc
       limit 1
       for update of m
    `;
    if (!match) {
      throw new AppError('NOT_FOUND', 'Матч не найден в сезоне');
    }

    if (isLockedKickoff(match.kickoff_utc)) {
      throw new AppError('INVALID_INPUT', 'Состав заблокирован: матч уже начался');
    }

    const [card] = await client<CardInstanceRow[]>`
      select ci.id,
             ci.owner_id,
             ci.season_id,
             c.id as card_id,
             c.player_name,
             c.nationality,
             c.role_group,
             c.rating,
             c.photo_url,
             c.rarity,
             c.national_team_id,
             nt.name as national_team_name,
             nt.slug as national_team_slug
        from card_instances ci
        join cards c on c.id = ci.card_id
        left join national_teams nt on nt.id = c.national_team_id
       where ci.id = ${input.cardInstanceId}
       for update of ci
    `;
    if (!card) throw new AppError('NOT_FOUND', 'Карточка не найдена');
    if (card.owner_id !== input.profileId) throw new AppError('FORBIDDEN', 'Карточка принадлежит другому игроку');
    if (card.season_id !== match.season_id) {
      throw new AppError('INVALID_INPUT', 'Карточка должна принадлежать тому же сезону, что и матч');
    }
    if (input.seasonId && card.season_id !== input.seasonId) {
      throw new AppError('INVALID_INPUT', 'Карточка не относится к указанному сезону');
    }

    const roleGroup = asRoleGroup(card.role_group);
    if (!canSlotCard({ slot: input.slot, roleGroup })) {
      throw new AppError('INVALID_INPUT', 'Карточка не подходит для выбранного слота по роли');
    }

    matchCardToMatchSide({
      homeName: match.home_name,
      awayName: match.away_name,
      card: {
        nationalTeamName: card.national_team_name,
        nationalTeamSlug: card.national_team_slug,
        nationality: card.nationality,
      },
    });

    const [cardUsedElsewhere] = await client<{ slot: LineupSlotKind }[]>`
      select slot
        from lineup_slots
       where match_id = ${match.id}
         and profile_id = ${input.profileId}
         and card_instance_id = ${input.cardInstanceId}
         and slot <> ${input.slot}
       limit 1
       for update
    `;
    if (cardUsedElsewhere) {
      throw new AppError('CONFLICT', 'Эта карточка уже используется в другом слоте этого матча');
    }

    // Replace card in target slot. Removing target slot first avoids unique(card) conflicts
    // when swapping between slots across calls is not attempted (we reject card reuse above).
    await client`
      delete from lineup_slots
       where match_id = ${match.id}
         and profile_id = ${input.profileId}
         and slot = ${input.slot}
    `;

    await client`
      insert into lineup_slots (season_id, matchday_id, match_id, profile_id, card_instance_id, slot, updated_at)
      values (${match.season_id}, ${match.matchday_id}, ${match.id}, ${input.profileId}, ${input.cardInstanceId}, ${input.slot}, now())
    `;
  });

  return await getMyLineup(input.matchId, input.profileId, input.seasonId, sql);
}

export async function removeLineupSlot(
  input: { profileId: string; matchId: string; slot: LineupSlotKind },
  sql: DbClient = db(),
): Promise<LineupSlotView[]> {
  if (!LINEUP_SLOTS.includes(input.slot)) {
    throw new AppError('INVALID_INPUT', 'Недопустимый слот состава');
  }

  await sql.begin(async (tx) => {
    const client = tx as unknown as DbClient;
    const [match] = await client<{ id: string; kickoff_utc: string | Date }[]>`
      select id, kickoff_utc
        from matches
       where id = ${input.matchId}
       for update
    `;
    if (!match) throw new AppError('NOT_FOUND', 'Матч не найден');
    if (isLockedKickoff(match.kickoff_utc)) {
      throw new AppError('INVALID_INPUT', 'Состав заблокирован: матч уже начался');
    }

    await client`
      delete from lineup_slots
       where match_id = ${input.matchId}
         and profile_id = ${input.profileId}
         and slot = ${input.slot}
    `;
  });

  return await getMyLineup(input.matchId, input.profileId, undefined, sql);
}

// Alias matching brief naming style for convenience.
export const getMatchLineupSlots = getMyLineup;
