import { db } from '@/lib/db';
import { hasDatabase } from '@/lib/env';
import type { MatchdayResultView, MatchdayView, SeasonSnapshot } from '@/lib/types';

type MatchdayResultRow = {
  matchday_id: string;
  game_date: string | Date;
  profile_id: string;
  nickname: string;
  answered: string | number | null;
  correct: string | number | null;
  total: string | number | null;
  bonus_hit: boolean | null;
  die_tier: string | null;
};

type MatchdayRow = {
  id: string;
  game_date: string | Date;
  opens_at: string | Date;
  closes_at: string | Date;
  status: string;
  q_total: string | number | null;
};

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return 0;
}

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return '';
}

function toDieTier(value: unknown): MatchdayResultView['dieTier'] {
  if (value === 'wood' || value === 'bronze' || value === 'silver' || value === 'gold') return value;
  return null;
}

export function mapMatchdayResultRows(rows: MatchdayResultRow[]): MatchdayResultView[] {
  return rows.map((row) => ({
    matchdayId: String(row.matchday_id),
    gameDate: toIsoDate(row.game_date),
    profileId: String(row.profile_id),
    nickname: String(row.nickname),
    answered: Math.max(0, toInt(row.answered)),
    correct: Math.max(0, toInt(row.correct)),
    total: Math.max(0, toInt(row.total)),
    bonusHit: Boolean(row.bonus_hit),
    dieTier: toDieTier(row.die_tier),
  }));
}

function accuracyOf(r: Pick<MatchdayResultView, 'correct' | 'answered' | 'total'>): number {
  if (r.total <= 0) return -1;
  if (r.answered <= 0) return 0;
  return r.correct / r.answered;
}

export function rankMatchdayResults(results: MatchdayResultView[]): MatchdayResultView[] {
  const rankable = results.some((r) => r.total > 0);
  const sorted = [...results].sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct;
    const accDiff = accuracyOf(b) - accuracyOf(a);
    if (accDiff !== 0) return accDiff;
    if (b.answered !== a.answered) return b.answered - a.answered;
    return a.nickname.localeCompare(b.nickname, 'ru');
  });

  if (!rankable) return sorted.map((r) => ({ ...r, rank: undefined }));

  return sorted.map((r, index) => ({ ...r, rank: index + 1 }));
}

function toMatchdayView(row: MatchdayRow): MatchdayView {
  return {
    id: String(row.id),
    gameDate: toIsoDate(row.game_date),
    opensAt: row.opens_at instanceof Date ? row.opens_at.toISOString() : String(row.opens_at),
    closesAt: row.closes_at instanceof Date ? row.closes_at.toISOString() : String(row.closes_at),
    status: row.status as MatchdayView['status'],
    qTotal: row.q_total == null ? null : toInt(row.q_total),
  };
}

const RESULTS_SELECT = `
  md.id as matchday_id,
  md.game_date::text as game_date,
  sp.profile_id,
  p.nickname,
  coalesce(ans.answered, 0)::int as answered,
  coalesce(ans.correct, 0)::int as correct,
  coalesce(md.q_total, qtot.total, 0)::int as total,
  coalesce(bonus.bonus_hit, false) as bonus_hit,
  day_die.tier as die_tier
`;

const RESULTS_FROM = `
  from matchdays md
  join season_players sp on sp.season_id = md.season_id and sp.is_active
  join profiles p on p.id = sp.profile_id
  left join lateral (
    select
      count(*) filter (where a.question_id is not null)::int as answered,
      count(*) filter (where a.is_correct is true)::int as correct
    from questions q
    left join answers a on a.question_id = q.id and a.profile_id = sp.profile_id
    where q.matchday_id = md.id
      and q.status = 'resolved'
      and q.is_bonus = false
  ) ans on true
  left join lateral (
    select count(*)::int as total
    from questions q
    where q.matchday_id = md.id and q.status = 'resolved' and q.is_bonus = false
  ) qtot on true
  left join lateral (
    select exists (
      select 1
      from answers a
      join questions q on q.id = a.question_id
      where a.profile_id = sp.profile_id
        and q.matchday_id = md.id
        and q.is_bonus = true
        and a.is_correct is true
    ) as bonus_hit
  ) bonus on true
  left join lateral (
    select d.tier
    from dice d
    where d.profile_id = sp.profile_id
      and d.matchday_id = md.id
      and d.source = 'matchday'
    limit 1
  ) day_die on true
`;

export async function loadMatchdayResults(seasonId: string, matchdayId: string): Promise<MatchdayResultView[]> {
  if (!hasDatabase()) return [];
  const sql = db();
  const rows = await sql<MatchdayResultRow[]>`
    select ${sql.unsafe(RESULTS_SELECT)}
    ${sql.unsafe(RESULTS_FROM)}
    where md.season_id = ${seasonId} and md.id = ${matchdayId}
  `;
  return rankMatchdayResults(mapMatchdayResultRows(rows));
}

export type LatestClosedDayResult = {
  matchday: MatchdayView;
  mine: MatchdayResultView;
  top: MatchdayResultView[];
};

export async function loadLatestClosedMatchdayResultForViewer(
  seasonId: string,
  profileId: string,
): Promise<LatestClosedDayResult | null> {
  if (!hasDatabase()) return null;
  const sql = db();

  const mdRows = await sql<MatchdayRow[]>`
    select id, game_date::text as game_date, opens_at, closes_at, status, q_total
    from matchdays
    where season_id = ${seasonId} and status = 'closed'
    order by game_date desc, closes_at desc
    limit 1
  `;
  const md = mdRows[0];
  if (!md) return null;

  const rows = await sql<MatchdayResultRow[]>`
    select ${sql.unsafe(RESULTS_SELECT)}
    ${sql.unsafe(RESULTS_FROM)}
    where md.season_id = ${seasonId} and md.id = ${md.id}
  `;
  const ranked = rankMatchdayResults(mapMatchdayResultRows(rows));
  const mine = ranked.find((r) => r.profileId === profileId);
  if (!mine) return null;

  return {
    matchday: toMatchdayView(md),
    mine,
    top: ranked.slice(0, 3),
  };
}

export type ClosedMatchdayOption = Pick<MatchdayView, 'id' | 'gameDate' | 'status' | 'qTotal'> & {
  closesAt: string;
};

export async function loadClosedMatchdays(seasonId: string, limit = 12): Promise<ClosedMatchdayOption[]> {
  if (!hasDatabase()) return [];
  const sql = db();
  const rows = await sql<MatchdayRow[]>`
    select id, game_date::text as game_date, opens_at, closes_at, status, q_total
    from matchdays
    where season_id = ${seasonId} and status = 'closed'
    order by game_date desc, closes_at desc
    limit ${limit}
  `;
  return rows.map((row) => ({
    id: String(row.id),
    gameDate: toIsoDate(row.game_date),
    status: row.status as MatchdayView['status'],
    qTotal: row.q_total == null ? null : toInt(row.q_total),
    closesAt: row.closes_at instanceof Date ? row.closes_at.toISOString() : String(row.closes_at),
  }));
}

export function demoClosedMatchdays(snapshot: SeasonSnapshot): ClosedMatchdayOption[] {
  const result = snapshot.myLastClosedDayResult;
  if (!result) return [];
  return [
    {
      id: result.matchdayId,
      gameDate: result.gameDate,
      status: 'closed',
      qTotal: result.total,
      closesAt: result.matchday.closesAt,
    },
  ];
}

export function demoMatchdayResults(snapshot: SeasonSnapshot, matchdayId: string): MatchdayResultView[] {
  if (snapshot.myLastClosedDayResult?.matchdayId !== matchdayId) return [];
  return rankMatchdayResults([...snapshot.lastClosedDayTop]);
}
