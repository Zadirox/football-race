/**
 * Синк футбольных данных и переходы статусов дня (docs/02 §2, §4).
 *
 * Всё, что здесь происходит, запускается cron-роутами, а не браузером.
 * Провайдер может не ответить — прогон пишется в `sync_runs`, а игра
 * продолжает жить на том, что уже лежит в БД.
 */

import { db } from '@/lib/db';
import { hasDatabase, serverEnv } from '@/lib/env';
import { fetchFixtures } from '@/lib/data/footballData';
import { normalizeMatches } from '@/lib/data/normalize';
import { syncWindow } from '@/lib/data/sync-window';
import { isAppError } from '@/lib/errors';
import {
  allMatchesFinal,
  nextMatchdayStatus,
  type DayMatch,
  type MatchdayStatus,
  type MatchStatus,
} from '@/lib/game/matchday-lifecycle';
import { gameDateOf, gameDayWindow } from '@/lib/time';

export type SyncReason =
  | 'CONFIG_MISSING'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'NO_ACTIVE_SEASON'
  | 'SYNC_QUOTA_EXCEEDED'
  | 'SYNC_PROVIDER_DOWN';

export type SyncFixturesReport = {
  ok: boolean;
  reason: SyncReason | null;
  fetched: number;
  kept: number;
  matches: number;
  matchdays: number;
  durationMs: number;
  httpStatus: number | null;
  error: string | null;
};

export type AdvanceReport = {
  ok: boolean;
  checked: number;
  changed: number;
  resolved: number;
  errors: string[];
};

type SyncRunEntry = {
  endpoint: string;
  status: 'ok' | 'skipped' | 'error';
  httpStatus: number | null;
  durationMs: number;
  requestsUsed: number;
  error: string | null;
};

async function logSyncRun(entry: SyncRunEntry): Promise<void> {
  try {
    await db()`
      insert into sync_runs (provider, endpoint, status, http_status, duration_ms, requests_used, error)
      values (
        'football-data',
        ${entry.endpoint},
        ${entry.status},
        ${entry.httpStatus},
        ${entry.durationMs},
        ${entry.requestsUsed},
        ${entry.error}
      )
    `;
  } catch (error) {
    // Лог не должен ронять синк: если БД недоступна, писать некуда.
    console.error('Не удалось записать sync_runs:', error);
  }
}

export async function syncFixtures(now = new Date()): Promise<SyncFixturesReport> {
  const startedAt = Date.now();
  const env = serverEnv();
  const window = syncWindow(now);

  const empty = {
    fetched: 0,
    kept: 0,
    matches: 0,
    matchdays: 0,
    httpStatus: null,
    error: null,
  };

  const finish = (reason: SyncReason | null, extra: Partial<SyncFixturesReport> = {}): SyncFixturesReport => {
    const report: SyncFixturesReport = {
      ...empty,
      ok: reason === null,
      reason,
      durationMs: Date.now() - startedAt,
      ...extra,
    };
    return report;
  };

  if (!hasDatabase()) return finish('CONFIG_MISSING');
  if (!env.footballDataToken) {
    await logSyncRun({
      endpoint: 'sync-fixtures',
      status: 'skipped',
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      requestsUsed: 0,
      error: 'FOOTBALL_DATA_TOKEN не задан',
    });
    return finish('PROVIDER_NOT_CONFIGURED');
  }

  const sql = db();

  const [season] = await sql<{ id: string }[]>`
    select id from seasons where status = 'active' order by starts_on desc limit 1
  `;
  if (!season) {
    await logSyncRun({
      endpoint: 'sync-fixtures',
      status: 'skipped',
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      requestsUsed: 0,
      error: 'Нет активного сезона',
    });
    return finish('NO_ACTIVE_SEASON');
  }

  let fixtures;
  try {
    fixtures = await fetchFixtures({ token: env.footballDataToken, from: window.from, to: window.to });
  } catch (error) {
    const reason: SyncReason = isAppError(error) && error.code === 'SYNC_QUOTA_EXCEEDED'
      ? 'SYNC_QUOTA_EXCEEDED'
      : 'SYNC_PROVIDER_DOWN';
    const message = error instanceof Error ? error.message : 'Провайдер недоступен';

    await logSyncRun({
      endpoint: 'sync-fixtures',
      status: 'error',
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      requestsUsed: 0,
      error: message.slice(0, 500),
    });

    return finish(reason, { error: message });
  }

  const normalized = normalizeMatches(fixtures.matches);
  const matchdayIds = new Map<string, string>();
  let savedMatches = 0;

  await sql.begin(async (tx) => {
    for (const match of normalized) {
      const gameDate = gameDateOf(match.kickoffUtc);
      const { opensAt, closesAt } = gameDayWindow(gameDate);

      let matchdayId = matchdayIds.get(gameDate);
      if (!matchdayId) {
        const [matchday] = await tx<{ id: string }[]>`
          insert into matchdays (season_id, game_date, opens_at, closes_at)
          values (${season.id}, ${gameDate}::date, ${opensAt}, ${closesAt})
          on conflict (season_id, game_date) do update set game_date = excluded.game_date
          returning id
        `;
        if (!matchday) throw new Error('Не удалось создать игровой день');
        matchdayId = matchday.id;
        matchdayIds.set(gameDate, matchdayId);
      }

      const [saved] = await tx<{ id: string }[]>`
        insert into matches (
          provider, external_id, league_code, league_title,
          home_name, home_logo, away_name, away_logo,
          kickoff_utc, status, minute, home_score, away_score,
          ht_home_score, ht_away_score, raw
        ) values (
          ${match.provider},
          ${match.externalId},
          ${match.leagueCode},
          ${match.leagueTitle},
          ${match.homeName},
          ${match.homeLogo},
          ${match.awayName},
          ${match.awayLogo},
          ${match.kickoffUtc},
          ${match.status},
          ${match.minute},
          ${match.homeScore},
          ${match.awayScore},
          ${match.htHomeScore},
          ${match.htAwayScore},
          ${tx.json(match.raw)}
        )
        on conflict (provider, external_id) do update set
          league_code = excluded.league_code,
          league_title = excluded.league_title,
          home_name = excluded.home_name,
          home_logo = excluded.home_logo,
          away_name = excluded.away_name,
          away_logo = excluded.away_logo,
          kickoff_utc = excluded.kickoff_utc,
          status = excluded.status,
          minute = excluded.minute,
          home_score = excluded.home_score,
          away_score = excluded.away_score,
          ht_home_score = excluded.ht_home_score,
          ht_away_score = excluded.ht_away_score,
          raw = excluded.raw
        returning id
      `;

      if (!saved) continue;
      savedMatches += 1;

      await tx`
        insert into matchday_matches (matchday_id, match_id)
        values (${matchdayId}, ${saved.id})
        on conflict do nothing
      `;
    }
  });

  await logSyncRun({
    endpoint: 'sync-fixtures',
    status: 'ok',
    httpStatus: fixtures.httpStatus,
    durationMs: Date.now() - startedAt,
    requestsUsed: fixtures.requestsUsed,
    error: null,
  });

  return finish(null, {
    fetched: fixtures.matches.length,
    kept: normalized.length,
    matches: savedMatches,
    matchdays: matchdayIds.size,
    httpStatus: fixtures.httpStatus,
  });
}

type DayRow = {
  id: string;
  status: MatchdayStatus;
  closes_ms: number | string | null;
};

type DayMatchRow = {
  status: MatchStatus;
  kickoff_ms: number | string;
};

/**
 * Переводит статусы дней и закрывает те, где все матчи уже финальные.
 * Закрытие — вызов `rpc_resolve_matchday`; он идемпотентен по `resolved_at`.
 */
export async function advanceMatchdays(now = new Date()): Promise<AdvanceReport> {
  if (!hasDatabase()) {
    return { ok: false, checked: 0, changed: 0, resolved: 0, errors: ['CONFIG_MISSING'] };
  }

  const sql = db();
  const nowMs = now.getTime();
  const report: AdvanceReport = { ok: true, checked: 0, changed: 0, resolved: 0, errors: [] };

  const days = await sql<DayRow[]>`
    select
      id,
      status,
      (extract(epoch from closes_at) * 1000)::bigint as closes_ms
    from matchdays
    where status <> 'closed'
      and resolved_at is null
    order by game_date asc
    limit 50
  `;

  for (const day of days) {
    report.checked += 1;

    const rows = await sql<DayMatchRow[]>`
      select
        m.status,
        (extract(epoch from m.kickoff_utc) * 1000)::bigint as kickoff_ms
      from matchday_matches mm
      join matches m on m.id = mm.match_id
      where mm.matchday_id = ${day.id}
        and mm.in_scope
    `;

    const matches: DayMatch[] = rows.map((row) => ({
      status: row.status,
      kickoffMs: Number(row.kickoff_ms),
    }));

    const next = nextMatchdayStatus({
      current: day.status,
      matches,
      nowMs,
      closesAtMs: Number(day.closes_ms ?? Number.NaN),
    });

    if (next !== day.status) {
      await sql`update matchdays set status = ${next} where id = ${day.id}`;
      report.changed += 1;
    }

    if (next !== 'resolving') continue;

    // Страховка: незавершённые матчи не должны «держать» вопросы открытыми.
    if (!allMatchesFinal(matches)) {
      await sql`
        update questions q
           set status = 'void', correct_option = null
          from matches m
         where q.match_id = m.id
           and q.matchday_id = ${day.id}
           and m.status not in ('FT', 'PST', 'CANC', 'ABD')
           and q.status <> 'void'
      `;
    }

    try {
      const [result] = await sql<{ result: { ok?: boolean; code?: string } }[]>`
        select public.rpc_resolve_matchday(${day.id}) as result
      `;
      if (result?.result?.ok) {
        report.resolved += 1;
      } else {
        report.errors.push(`${day.id}: ${result?.result?.code ?? 'RESOLVE_FAILED'}`);
      }
    } catch (error) {
      report.ok = false;
      report.errors.push(`${day.id}: ${(error as Error).message}`);
    }
  }

  if (report.errors.length > 0) report.ok = false;
  return report;
}
