import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { LINEUP_POINTS, defBonusTriggered, type CardRarity } from '@/lib/game/cards';
import { matchCardToMatchSide } from '@/lib/repo/lineups';

type DbClient = ReturnType<typeof db>;

type CandidateRow = {
  slot_id: string;
  season_id: string;
  profile_id: string;
  match_id: string;
  card_instance_id: string;
  home_name: string;
  away_name: string;
  home_score: number | string;
  away_score: number | string;
  rarity: string;
  nationality: string | null;
  national_team_name: string | null;
  national_team_slug: string | null;
};

function toInt(value: number | string): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRarity(value: string): CardRarity | null {
  if (value === 'common' || value === 'rare' || value === 'epic' || value === 'legend') return value;
  return null;
}

async function awardCandidate(row: CandidateRow, sql: DbClient): Promise<boolean> {
  let side: 'home' | 'away';
  try {
    side = matchCardToMatchSide({
      homeName: row.home_name,
      awayName: row.away_name,
      card: {
        nationalTeamName: row.national_team_name,
        nationalTeamSlug: row.national_team_slug,
        nationality: row.nationality,
      },
    });
  } catch {
    // Fail closed on ambiguous/unmatchable team mapping.
    return false;
  }

  const homeGoals = toInt(row.home_score);
  const awayGoals = toInt(row.away_score);
  const teamGoals = side === 'home' ? homeGoals : awayGoals;
  const oppGoals = side === 'home' ? awayGoals : homeGoals;
  if (!defBonusTriggered({ teamGoals, oppGoals })) return false;

  const rarity = asRarity(row.rarity);
  if (!rarity) return false;
  const points = LINEUP_POINTS[rarity];
  const refTable = 'lineup_slot';

  await sql`
    insert into lineup_card_results (
      lineup_slot_id, profile_id, match_id, card_instance_id,
      rarity, points, awarded, method, awarded_at, awarded_by, reason
    )
    values (
      ${row.slot_id}, ${row.profile_id}, ${row.match_id}, ${row.card_instance_id},
      ${rarity}, ${points}, true, 'auto', now(), null, 'auto_def_win_by_2'
    )
    on conflict (lineup_slot_id)
    do update set
      profile_id = excluded.profile_id,
      match_id = excluded.match_id,
      card_instance_id = excluded.card_instance_id,
      rarity = excluded.rarity,
      points = excluded.points,
      awarded = true,
      method = 'auto',
      awarded_at = coalesce(lineup_card_results.awarded_at, now()),
      awarded_by = null,
      reason = 'auto_def_win_by_2'
  `;

  await sql`
    insert into score_events (season_id, profile_id, kind, points, ref_table, ref_id)
    values (${row.season_id}, ${row.profile_id}, 'lineup_bonus', ${points}, ${refTable}, ${row.slot_id})
    on conflict (season_id, profile_id, kind, ref_table, ref_id)
    do update set points = excluded.points
  `;

  return true;
}

export async function awardAutoDefBonusesForMatchdays(
  matchdayIds: string[],
  sql: DbClient = db(),
): Promise<number> {
  if (!serverEnv().cardsEnabled) return 0;
  if (matchdayIds.length === 0) return 0;

  const rows = await sql<CandidateRow[]>`
    select ls.id as slot_id,
           ls.season_id,
           ls.profile_id,
           ls.match_id,
           ls.card_instance_id,
           m.home_name,
           m.away_name,
           m.home_score,
           m.away_score,
           c.rarity,
           c.nationality,
           nt.name as national_team_name,
           nt.slug as national_team_slug
      from lineup_slots ls
      join matches m on m.id = ls.match_id
      join card_instances ci on ci.id = ls.card_instance_id
      join cards c on c.id = ci.card_id
      left join national_teams nt on nt.id = c.national_team_id
     where ls.matchday_id = any(${matchdayIds}::uuid[])
       and m.status = 'FT'
       and m.home_score is not null
       and m.away_score is not null
       and c.role_group = 'DEF'
  `;

  let awarded = 0;
  for (const row of rows) {
    if (await awardCandidate(row, sql)) awarded += 1;
  }
  return awarded;
}

export async function awardAutoDefBonusesForMatches(
  matchIds: string[],
  sql: DbClient = db(),
): Promise<number> {
  if (!serverEnv().cardsEnabled) return 0;
  if (matchIds.length === 0) return 0;

  const rows = await sql<CandidateRow[]>`
    select ls.id as slot_id,
           ls.season_id,
           ls.profile_id,
           ls.match_id,
           ls.card_instance_id,
           m.home_name,
           m.away_name,
           m.home_score,
           m.away_score,
           c.rarity,
           c.nationality,
           nt.name as national_team_name,
           nt.slug as national_team_slug
      from lineup_slots ls
      join matches m on m.id = ls.match_id
      join card_instances ci on ci.id = ls.card_instance_id
      join cards c on c.id = ci.card_id
      left join national_teams nt on nt.id = c.national_team_id
     where ls.match_id = any(${matchIds}::uuid[])
       and m.status = 'FT'
       and m.home_score is not null
       and m.away_score is not null
       and c.role_group = 'DEF'
  `;

  let awarded = 0;
  for (const row of rows) {
    if (await awardCandidate(row, sql)) awarded += 1;
  }
  return awarded;
}
