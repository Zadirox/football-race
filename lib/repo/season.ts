/**
 * Единственная точка, откуда экраны берут состояние сезона.
 *
 * Без `DATABASE_URL` источник — детерминированный демо-снимок: на нём работает
 * весь игровой цикл, карта, предикты и рейтинги.
 *
 * С базой снимок собирается из `seasons` / `season_players` / `matchdays` /
 * `matches` / `questions` / `dice` / `active_effects` / `activity_log`.
 * SQL и сборка живут здесь, маппинг строк — в `lib/repo/mappers.ts` (он покрыт
 * юнит-тестами, потому что живой базы до подключения ключей нет).
 */

import { cache } from 'react';
import { db } from '@/lib/db';
import { getViewer } from '@/lib/auth/session';
import { buildDemoSnapshot } from '@/lib/demo/snapshot';
import { hasDatabase } from '@/lib/env';
import { loadLatestClosedMatchdayResultForViewer } from '@/lib/repo/matchday-results';
import {
  toActivityViews,
  toCellViews,
  toMatchdayView,
  toMatchView,
  toMeView,
  toPendingChoice,
  toPlayerViews,
  toQuestionView,
  toRatingsSeed,
  toSeasonView,
  type ActivityRow,
  type CellRow,
  type EffectRow,
  type MatchdayRow,
  type MatchRow,
  type PendingRow,
  type PlayerRow,
  type QuestionRow,
  type SeasonRow,
} from '@/lib/repo/mappers';
import { gameDateOf } from '@/lib/time';
import type { CellView, MyLastClosedDayResult, SeasonSnapshot } from '@/lib/types';

function maskSecretCells(cells: CellView[], players: { position: number }[]): CellView[] {
  const revealed = players.some((p) => p.position >= 30);
  if (revealed) return cells;
  return cells.map((cell) =>
    cell.idx >= 41 && cell.idx <= 80
      ? { ...cell, kind: 'event', mechanicCode: 'secret' }
      : cell,
  );
}

export type SeasonViewer = Awaited<ReturnType<typeof getViewer>>;

const getCachedViewer = cache(getViewer);

// Короткий серверный кэш: вкладки запрашивают снимок подряд при навигации,
// а полный сбор из БД + auth заметно задерживает открытие (1-2с).
// TTL очень маленький, чтобы не мешать обновлениям после мутаций/revalidatePath.
const SNAPSHOT_TTL_MS = 5_000;

export function invalidateSeasonSnapshotCache(profileId?: string | null): void {
  if (profileId) {
    snapshotCache.delete(profileId);
    return;
  }
  snapshotCache.clear();
}
const snapshotCache = new Map<string, { at: number; value: Promise<SeasonSnapshot> }>();

async function loadSeasonSnapshotUncachedForViewer(viewer: SeasonViewer): Promise<SeasonSnapshot> {
  if (!hasDatabase()) return buildDemoSnapshot();
  try {
    return await loadFromDatabase(viewer);
  } catch (error) {
    console.error('Не удалось собрать снимок сезона из БД:', error);
    return buildDemoSnapshot();
  }
}

/** Дедупликация в рамках одного запроса + короткий TTL между запросами. */
export const loadSeasonSnapshot = cache(async (): Promise<SeasonSnapshot> => {
  const viewer = await getCachedViewer();
  const key = viewer?.profileId ?? '__anon__';
  const now = Date.now();
  const hit = snapshotCache.get(key);
  if (hit && now - hit.at < SNAPSHOT_TTL_MS) return hit.value;

  const value = loadSeasonSnapshotUncachedForViewer(viewer).catch((err) => {
    snapshotCache.delete(key);
    throw err;
  });
  snapshotCache.set(key, { at: now, value });
  return value;
});

async function loadFromDatabase(viewer: SeasonViewer): Promise<SeasonSnapshot> {
  const sql = db();

  const [seasonRows, effectRows, cellRows] = await Promise.all([
    sql<SeasonRow[]>`
      select id, slug, title, status, starts_on::text as starts_on, ends_on::text as ends_on
      from seasons
      where status = 'active'
      order by starts_on desc
      limit 1
    `,
    sql<EffectRow[]>`
      select ae.profile_id, ae.code, ae.charges
      from active_effects ae
      join seasons s on s.id = ae.season_id
      where s.status = 'active'
        and (ae.expires_at is null or ae.expires_at > now())
        and ae.charges > 0
    `,
    sql<CellRow[]>`
      select c.idx, c.kind, c.mechanic_code
      from cells c
      join seasons s on s.id = c.season_id
      where s.status = 'active'
      order by c.idx
    `,
  ]);

  const season = seasonRows[0];
  if (!season) {
    // База подключена, но сезон ещё не засижен — честно остаёмся на демо.
    return buildDemoSnapshot();
  }

  const todayGameDate = gameDateOf(new Date());

  const [playerRows, matchdayRows] = await Promise.all([
    sql<PlayerRow[]>`
      select
        sp.profile_id,
        p.nickname,
        p.avatar_url,
        p.role,
        sp.position,
        sp.finished_at,
        coalesce(points.total, 0) as points,
        coalesce(ans.answered, 0) as answered,
        coalesce(ans.correct, 0) as correct,
        last_msg.message as last_action,
        coalesce(dc.wood, 0) as dice_wood,
        coalesce(dc.bronze, 0) as dice_bronze,
        coalesce(dc.silver, 0) as dice_silver,
        coalesce(dc.gold, 0) as dice_gold,
        p.favorite_club_id,
        fc.name as favorite_club_name,
        p.favorite_national_team_id,
        fnt.name as favorite_national_team_name,
        p.favorite_player_id,
        fp.name as favorite_player_name
      from season_players sp
      join profiles p on p.id = sp.profile_id
      left join clubs fc on fc.id = p.favorite_club_id
      left join national_teams fnt on fnt.id = p.favorite_national_team_id
      left join players fp on fp.id = p.favorite_player_id
      left join lateral (
        select sum(se.points)::int as total
        from score_events se
        where se.season_id = sp.season_id and se.profile_id = sp.profile_id
      ) points on true
      left join lateral (
        select
          count(*) filter (where q.is_bonus = false)::int as answered,
          count(*) filter (where q.is_bonus = false and a.is_correct is true)::int as correct
        from answers a
        join questions q on q.id = a.question_id
        join matchdays md on md.id = q.matchday_id
        where md.season_id = sp.season_id
          and a.profile_id = sp.profile_id
          and q.status = 'resolved'
      ) ans on true
      left join lateral (
        select al.message
        from activity_log al
        where al.season_id = sp.season_id and al.profile_id = sp.profile_id
        order by al.created_at desc
        limit 1
      ) last_msg on true
      left join lateral (
        select
          count(*) filter (where d.tier = 'wood')::int as wood,
          count(*) filter (where d.tier = 'bronze')::int as bronze,
          count(*) filter (where d.tier = 'silver')::int as silver,
          count(*) filter (where d.tier = 'gold')::int as gold
        from dice d
        where d.season_id = sp.season_id
          and d.profile_id = sp.profile_id
          and d.consumed_at is null
      ) dc on true
      where sp.season_id = ${season.id} and sp.is_active
      order by sp.position desc, p.nickname
    `,
    sql<MatchdayRow[]>`
      select id, game_date::text as game_date, opens_at, closes_at, status, q_total
      from matchdays
      where season_id = ${season.id}
      order by
        case
          when game_date = ${todayGameDate}::date then 0
          when game_date > ${todayGameDate}::date then 1
          else 2
        end,
        case when game_date >= ${todayGameDate}::date then game_date end asc,
        game_date desc
      limit 1
    `,
  ]);

  const matchday = matchdayRows[0] ?? null;
  const viewerId = viewer?.profileId ?? null;

  const [matchRows, questionRows, activityRows, pendingRows] = matchday
    ? await Promise.all([
        sql<MatchRow[]>`
          select
            m.id,
            m.league_code,
            m.league_title,
            m.home_name,
            m.home_logo,
            m.away_name,
            m.away_logo,
            m.kickoff_utc,
            m.status,
            m.minute,
            m.home_score,
            m.away_score,
            mm.in_scope,
            (
              select count(*)::int
              from questions q
              where q.match_id = m.id and q.matchday_id = ${matchday.id} and q.is_bonus = false
            ) as question_count,
            (
              select count(*)::int
              from answers a
              join questions q on q.id = a.question_id
              where q.match_id = m.id
                and q.matchday_id = ${matchday.id}
                and q.is_bonus = false
                and a.profile_id = ${viewerId}::uuid
            ) as my_answered
          from matchday_matches mm
          join matches m on m.id = mm.match_id
          where mm.matchday_id = ${matchday.id}
          order by m.kickoff_utc
        `,
        sql<QuestionRow[]>`
          select
            q.id,
            q.match_id,
            q.kind,
            q.prompt,
            q.options,
            q.is_bonus,
            q.locks_at,
            q.status,
            q.correct_option,
            my.choice as my_choice,
            case when q.status <> 'open' then dist.distribution else null end as distribution
          from questions q
          left join answers my on my.question_id = q.id and my.profile_id = ${viewerId}::uuid
          left join lateral (
            select jsonb_object_agg(t.choice, t.n) as distribution
            from (
              select a2.choice, count(*)::int as n
              from answers a2
              where a2.question_id = q.id
              group by a2.choice
            ) t
          ) dist on true
          where q.matchday_id = ${matchday.id}
          order by q.locks_at, q.is_bonus, q.id
        `,
        sql<ActivityRow[]>`
          select id::text as id, kind, message, created_at
          from activity_log
          where season_id = ${season.id}
          order by created_at desc
          limit 40
        `,
        sql<PendingRow[]>`
          select id, event_id, kind, payload, expires_at
          from pending_actions
          where season_id = ${season.id}
            and profile_id = ${viewerId}::uuid
            and resolved_at is null
            and expires_at > now()
            and event_id is not null
          order by created_at desc
          limit 1
        `,
      ])
    : [[], [], [], []];

  const players = toPlayerViews(playerRows, effectRows, viewerId);
  const cells = maskSecretCells(toCellViews(cellRows), players);

  let myLastClosedDayResult: MyLastClosedDayResult | null = null;
  let lastClosedDayTop: SeasonSnapshot['lastClosedDayTop'] = [];
  if (viewerId) {
    const closed = await loadLatestClosedMatchdayResultForViewer(season.id, viewerId);
    if (closed) {
      myLastClosedDayResult = { ...closed.mine, matchday: closed.matchday };
      lastClosedDayTop = closed.top;
    }
  }

  return {
    season: toSeasonView(season),
    players,
    cells,
    matchday: toMatchdayView(matchday),
    matches: matchRows.map(toMatchView),
    questions: questionRows.map(toQuestionView),
    activity: toActivityViews(activityRows),
    ratingsSeed: toRatingsSeed(players),
    me: toMeView(playerRows, viewer),
    pending: toPendingChoice(pendingRows[0] ?? null),
    myLastClosedDayResult,
    lastClosedDayTop,
    serverNow: new Date().toISOString(),
    demo: false,
  };
}

export function seasonClosesAt(snapshot: SeasonSnapshot): string | null {
  return snapshot.matchday?.closesAt ?? null;
}
