import { db } from '@/lib/db';
import { hasDatabase } from '@/lib/env';
import type { CardBonusReportView, CardBonusReportsStateView, CardBonusReportItemView } from '@/lib/types';

type DbClient = ReturnType<typeof db>;

export type CardBonusReportSource = 'batch' | 'historical';

type ReportItemDbRow = {
  report_id: string;
  profile_id: string;
  lineup_slot_id: string | null;
  match_id: string | null;
  awarded: boolean;
  points: number | string;
  card_name: string;
  card_photo_url: string | null;
  card_team_name: string | null;
  slot: 'GK' | 'OF1' | 'OF2';
  role_group: 'GK' | 'DEF' | 'MID' | 'FWD';
  rarity: 'common' | 'rare' | 'epic' | 'legend';
  rating: number | string | null;
  home_team_name: string;
  away_team_name: string;
  kickoff_at: string | Date;
  source: CardBonusReportSource;
  created_at: string | Date;
  seen_at: string | Date | null;
};

function toIso(value: string | Date | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}
function toNum(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') { const n = Number(value); return Number.isFinite(n) ? n : 0; }
  return 0;
}

export function normalizeCardBonusReportItemsForPlayer<T extends { awarded: boolean }>(items: readonly T[]): T[] {
  return items.filter((item) => item.awarded);
}

function mapItem(row: ReportItemDbRow): CardBonusReportItemView {
  return {
    reportId: row.report_id,
    profileId: row.profile_id,
    lineupSlotId: row.lineup_slot_id ?? '',
    matchId: row.match_id ?? '',
    awarded: row.awarded,
    points: toNum(row.points),
    cardName: row.card_name,
    cardPhotoUrl: row.card_photo_url,
    cardTeamName: row.card_team_name,
    slot: row.slot,
    roleGroup: row.role_group,
    rarity: row.rarity,
    rating: toNum(row.rating),
    homeTeamName: row.home_team_name,
    awayTeamName: row.away_team_name,
    kickoffAt: toIso(row.kickoff_at),
    source: row.source,
    createdAt: toIso(row.created_at),
    seenAt: row.seen_at ? toIso(row.seen_at) : null,
    isNew: !row.seen_at,
  };
}

async function listHistoricalAwardedItems(profileId: string, seasonId: string, sql: DbClient): Promise<CardBonusReportItemView[]> {
  // Pre-feature/historical awarded bonuses not represented in report items.
  const rows = await sql<any[]>`
    select
      'hist:' || lcr.lineup_slot_id::text as report_id,
      lcr.profile_id,
      lcr.lineup_slot_id::text as lineup_slot_id,
      lcr.match_id::text as match_id,
      true as awarded,
      lcr.points,
      c.player_name as card_name,
      c.photo_url as card_photo_url,
      coalesce(nt.name, c.nationality) as card_team_name,
      ls.slot,
      c.role_group,
      c.rarity,
      c.rating,
      m.home_name as home_team_name,
      m.away_name as away_team_name,
      m.kickoff_utc as kickoff_at,
      'historical'::text as source,
      coalesce(lcr.awarded_at, lcr.created_at, m.kickoff_utc) as created_at,
      null::timestamptz as seen_at
    from lineup_card_results lcr
    join lineup_slots ls on ls.id = lcr.lineup_slot_id
    join matches m on m.id = lcr.match_id
    join card_instances ci on ci.id = lcr.card_instance_id
    join cards c on c.id = ci.card_id
    left join national_teams nt on nt.id = c.national_team_id
    where lcr.profile_id = ${profileId}
      and ls.season_id = ${seasonId}
      and lcr.awarded = true
      and not exists (
        select 1 from card_bonus_report_items i where i.lineup_slot_id = lcr.lineup_slot_id and i.awarded = true
      )
    order by coalesce(lcr.awarded_at, lcr.created_at, m.kickoff_utc) desc
    limit 200
  `;
  return rows.map((r) => mapItem(r as ReportItemDbRow));
}

export async function listCardBonusReportsForProfile(
  profileId: string,
  seasonId: string,
  sql: DbClient = db(),
): Promise<CardBonusReportView[]> {
  if (!hasDatabase()) return [];
  const rows = await sql<ReportItemDbRow[]>`
    select
      i.report_id::text as report_id,
      i.profile_id::text as profile_id,
      i.lineup_slot_id::text as lineup_slot_id,
      i.match_id::text as match_id,
      i.awarded,
      i.points,
      i.card_name,
      i.card_photo_url,
      i.card_team_name,
      i.slot,
      i.role_group,
      i.rarity,
      i.rating,
      i.home_team_name,
      i.away_team_name,
      i.kickoff_at,
      r.source,
      i.created_at,
      s.seen_at
    from card_bonus_report_items i
    join card_bonus_reports r on r.id = i.report_id
    left join card_bonus_report_seen s on s.report_id = i.report_id and s.profile_id = ${profileId}
    where i.profile_id = ${profileId}
      and i.season_id = ${seasonId}
      and i.awarded = true
    order by i.created_at desc, i.id desc
    limit 500
  `;

  const byReport = new Map<string, CardBonusReportView>();
  for (const row of rows) {
    const item = mapItem(row);
    const existing = byReport.get(item.reportId);
    if (existing) {
      existing.items.push(item);
      existing.totalPoints += item.points;
      existing.awardedCount += 1;
      if (item.isNew) existing.items[0]!.isNew = existing.items[0]!.isNew; // no-op, keep
    } else {
      byReport.set(item.reportId, {
        reportId: item.reportId,
        createdAt: item.createdAt,
        source: item.source,
        totalPoints: item.points,
        awardedCount: 1,
        items: [item],
      });
    }
  }

  const historical = await listHistoricalAwardedItems(profileId, seasonId, sql);
  for (const item of historical) {
    byReport.set(item.reportId, {
      reportId: item.reportId,
      createdAt: item.createdAt,
      source: 'historical',
      totalPoints: item.points,
      awardedCount: 1,
      items: [item],
    });
  }

  const reports = Array.from(byReport.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Mark report-level newness: any unseen item => report has unseen
  for (const r of reports) {
    const hasNew = r.items.some((i) => i.isNew);
    for (const i of r.items) i.isNew = hasNew;
  }
  return reports;
}

export async function getCardBonusReportsStateForProfile(
  profileId: string,
  seasonId: string,
  sql: DbClient = db(),
): Promise<CardBonusReportsStateView> {
  if (!hasDatabase()) return { unseenCount: 0, reports: [] };
  const reports = await listCardBonusReportsForProfile(profileId, seasonId, sql);
  const unseenCount = reports.filter((r) => r.items.some((i) => i.isNew && r.source !== 'historical')).length;
  return { unseenCount, reports };
}

export async function markCardBonusReportsSeen(
  profileId: string,
  seasonId: string,
  reportIds?: string[],
  sql: DbClient = db(),
): Promise<void> {
  if (!hasDatabase()) return;
  const ids = (reportIds ?? []).filter((id) => !id.startsWith('hist:'));
  if (reportIds && ids.length === 0) return;

  if (!reportIds) {
    await sql`
      insert into card_bonus_report_seen (report_id, profile_id, seen_at)
      select distinct i.report_id, ${profileId}, now()
      from card_bonus_report_items i
      where i.profile_id = ${profileId}
        and i.season_id = ${seasonId}
        and i.awarded = true
      on conflict (report_id, profile_id) do update set seen_at = now()
    `;
    return;
  }

  await sql`
    insert into card_bonus_report_seen (report_id, profile_id, seen_at)
    select r.id, ${profileId}, now()
    from card_bonus_reports r
    where r.id in ${sql(ids)}
      and exists (select 1 from card_bonus_report_items i where i.report_id = r.id and i.profile_id = ${profileId})
    on conflict (report_id, profile_id) do update set seen_at = now()
  `;
}
