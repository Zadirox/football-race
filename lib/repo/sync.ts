/**
 * Синк футбольных данных и переходы статусов дня.
 *
 * Всё, что здесь происходит, запускается cron-роутами и админкой, а не браузером.
 * Источники могут не ответить — прогон пишется в `sync_runs`, а игра
 * продолжает жить на том, что уже лежит в БД.
 */

import { db } from '@/lib/db';
import { hasDatabase, serverEnv } from '@/lib/env';
import { fetchFixtures } from '@/lib/data/footballData';
import { enrichSstatsMatchesWithStats, fetchSstatsUnlFixtures } from '@/lib/data/sstats';
import { normalizeMatches, type NormalizedMatch } from '@/lib/data/normalize';
import { generateMatchQuestions } from '@/lib/data/questions';
import { syncWindow } from '@/lib/data/sync-window';
import { isAppError } from '@/lib/errors';
import { grantPacksForResolvedNationalMatchday } from '@/lib/repo/cards-grants';
import {
  allMatchesFinal,
  nextMatchdayStatus,
  type DayMatch,
  type MatchdayStatus,
  type MatchStatus,
} from '@/lib/game/matchday-lifecycle';
import { gameDateOf, gameDayWindow, type GameDate } from '@/lib/time';

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
  questions: number;
  durationMs: number;
  httpStatus: number | null;
  error: string | null;
};

export type SyncFixturesOptions = {
  now?: Date;
  /** Разовый прогон за выбранные игровые даты (ГГГГ-ММ-ДД), вместо обычного окна. */
  window?: { from: GameDate; to: GameDate };
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
  provider?: string;
};

async function logSyncRun(entry: SyncRunEntry): Promise<void> {
  try {
    await db()`
      insert into sync_runs (provider, endpoint, status, http_status, duration_ms, requests_used, error)
      values (
        ${entry.provider ?? 'multi'},
        ${entry.endpoint},
        ${entry.status},
        ${entry.httpStatus},
        ${entry.durationMs},
        ${entry.requestsUsed},
        ${entry.error}
      )
    `;
  } catch (error) {
    // Лог не должен ломать синк: пишем в консоль, матчам это не мешает.
    console.error('Не удалось записать sync_runs:', error);
  }
}

function mergeMatches(groups: NormalizedMatch[][]): NormalizedMatch[] {
  const map = new Map<string, NormalizedMatch>();
  for (const group of groups) {
    for (const match of group) {
      map.set(`${match.provider}:${match.externalId}`, match);
    }
  }
  return [...map.values()].sort((a, b) => a.kickoffUtc.getTime() - b.kickoffUtc.getTime());
}

export async function syncFixtures(options: SyncFixturesOptions = {}): Promise<SyncFixturesReport> {
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  const env = serverEnv();
  const window = options.window ?? syncWindow(now);

  const empty = {
    fetched: 0,
    kept: 0,
    matches: 0,
    matchdays: 0,
    questions: 0,
    httpStatus: null as number | null,
    error: null as string | null,
  };

  const finish = (reason: SyncReason | null, extra: Partial<SyncFixturesReport> = {}): SyncFixturesReport => {
    return {
      ...empty,
      ok: reason === null,
      reason,
      durationMs: Date.now() - startedAt,
      ...extra,
    };
  };

  if (!hasDatabase()) return finish('CONFIG_MISSING');

  const hasFootballData = Boolean(env.footballDataToken);
  if (!hasFootballData) {
    // Лигу наций попробуем подтянуть из запасного источника ниже; если и он не даст матчей,
    // вернём понятную причину как раньше.
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
      provider: 'multi',
    });
    return finish('NO_ACTIVE_SEASON');
  }

  let fetchedTotal = 0;
  let requestsUsed = 0;
  let httpStatus: number | null = null;
  const errors: string[] = [];
  const groups: NormalizedMatch[][] = [];

  if (hasFootballData) {
    try {
      const fixtures = await fetchFixtures({ token: env.footballDataToken!, from: window.from, to: window.to });
      fetchedTotal += fixtures.matches.length;
      requestsUsed += fixtures.requestsUsed;
      httpStatus = fixtures.httpStatus;
      groups.push(normalizeMatches(fixtures.matches));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Источник матчей недоступен';
      errors.push(message);
      // 429 фиксируем отдельно, но даём шанс запасному источнику (Лига наций) отработать.
      if (isAppError(error) && error.code === 'SYNC_QUOTA_EXCEEDED') {
        // не прерываем сразу
      }
    }
  }

  // Лига наций: берём из запасного источника (основной тариф её не отдаёт).
  try {
    const unl = await fetchSstatsUnlFixtures({
      from: window.from,
      to: window.to,
      apiKey: env.sstatsApiKey,
    });
    fetchedTotal += unl.fetched;
    requestsUsed += unl.requestsUsed;
    if (httpStatus === null) httpStatus = unl.httpStatus;

    const enriched = await enrichSstatsMatchesWithStats({
      matches: unl.matches,
      apiKey: env.sstatsApiKey,
    });
    requestsUsed += enriched.requestsUsed;
    groups.push(enriched.matches);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Источник Лиги наций недоступен';
    errors.push(`Лига наций: ${message}`);
  }

  const normalized = mergeMatches(groups);

  if (normalized.length === 0) {
    // Если ошибок не было — просто в этом периоде нет подходящих матчей, это нормальный результат.
    if (errors.length === 0) {
      await logSyncRun({
        endpoint: 'sync-fixtures',
        status: 'ok',
        httpStatus,
        durationMs: Date.now() - startedAt,
        requestsUsed,
        error: null,
        provider: 'multi',
      });
      return finish(null, { fetched: fetchedTotal, kept: 0, matches: 0, matchdays: 0, questions: 0, httpStatus });
    }

    const quota = errors.some((e) => e.toLowerCase().includes('quota') || e.includes('429'));
    const reason: SyncReason = quota ? 'SYNC_QUOTA_EXCEEDED' : 'SYNC_PROVIDER_DOWN';

    await logSyncRun({
      endpoint: 'sync-fixtures',
      status: 'error',
      httpStatus,
      durationMs: Date.now() - startedAt,
      requestsUsed,
      error: errors.join('; ').slice(0, 500),
      provider: 'multi',
    });

    return finish(reason, { fetched: fetchedTotal, kept: 0, httpStatus, error: errors.join('; ') || null });
  }

  const matchdayIds = new Map<string, string>();
  let savedMatches = 0;
  let createdQuestions = 0;

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
          ht_home_score, ht_away_score,
          corners_home, corners_away,
          yellow_cards_home, yellow_cards_away,
          red_cards_home, red_cards_away,
          possession_home, possession_away,
          shots_on_target_home, shots_on_target_away,
          raw
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
          ${match.stats.cornersHome},
          ${match.stats.cornersAway},
          ${match.stats.yellowCardsHome},
          ${match.stats.yellowCardsAway},
          ${match.stats.redCardsHome},
          ${match.stats.redCardsAway},
          ${match.stats.possessionHome},
          ${match.stats.possessionAway},
          ${match.stats.shotsOnTargetHome},
          ${match.stats.shotsOnTargetAway},
          ${tx.json(match.raw as any)}
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
          corners_home = excluded.corners_home,
          corners_away = excluded.corners_away,
          yellow_cards_home = excluded.yellow_cards_home,
          yellow_cards_away = excluded.yellow_cards_away,
          red_cards_home = excluded.red_cards_home,
          red_cards_away = excluded.red_cards_away,
          possession_home = excluded.possession_home,
          possession_away = excluded.possession_away,
          shots_on_target_home = excluded.shots_on_target_home,
          shots_on_target_away = excluded.shots_on_target_away,
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

      // Вопросы для прогнозов: создаём один раз на матч в этом игровом дне.
      const existing = await tx<{ count: string }[]>`
        select count(*)::text as count from questions where matchday_id = ${matchdayId} and match_id = ${saved.id}
      `;
      if (Number(existing[0]?.count ?? '0') === 0) {
        const seed = Math.abs(hashString(`${match.provider}:${match.externalId}`));
        const generated = generateMatchQuestions({ homeName: match.homeName, awayName: match.awayName }, seed, 4);
        for (const question of generated) {
          await tx`
            insert into questions (
              matchday_id, match_id, kind, template, prompt, options, rule,
              locks_at, is_bonus, status, source
            ) values (
              ${matchdayId}, ${saved.id}, ${question.kind}, ${question.rule.type}, ${question.prompt},
              ${tx.json(question.options as any)}, ${tx.json(question.rule as any)},
              ${match.kickoffUtc}, ${question.isBonus}, 'open', 'auto'
            )
          `;
          createdQuestions += 1;
        }
      }
    }

    // Обновляем количество вопросов дня (для отображения).
    for (const [gameDate, matchdayId] of matchdayIds.entries()) {
      const totals = await tx<{ total: string }[]>`
        select count(*)::text as total from questions q
        join matchday_matches mm on mm.match_id = q.match_id and mm.matchday_id = q.matchday_id
        where q.matchday_id = ${matchdayId} and q.is_bonus = false and mm.in_scope
      `;
      await tx`update matchdays set q_total = ${Number(totals[0]?.total ?? '0')} where id = ${matchdayId}`;
      void gameDate;
    }
  });

  await logSyncRun({
    endpoint: 'sync-fixtures',
    status: 'ok',
    httpStatus,
    durationMs: Date.now() - startedAt,
    requestsUsed,
    error: errors.length ? errors.join('; ').slice(0, 500) : null,
    provider: 'multi',
  });

  return finish(null, {
    fetched: fetchedTotal,
    kept: normalized.length,
    matches: savedMatches,
    matchdays: matchdayIds.size,
    questions: createdQuestions,
    httpStatus,
  });
}

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return h;
}

type DayRow = {
  id: string;
  season_id: string;
  status: MatchdayStatus;
  closes_ms: number | string | null;
};

type DayMatchRow = {
  status: MatchStatus;
  kickoff_ms: number | string;
};

/**
 * Сдвигает статусы дней и резолвит те, где все матчи финальные.
 * Закрытие — вызов `rpc_resolve_matchday`; он идемпотентен на `resolved_at`.
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
      season_id,
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

    // Матч завис не финально — гасим по нему вопросы, чтобы день мог закрыться.
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
        try {
          await grantPacksForResolvedNationalMatchday(day.id, day.season_id, sql);
        } catch (error) {
          report.errors.push(
            `${day.id}: pack grants failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
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
