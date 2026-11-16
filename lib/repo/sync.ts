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
import { awardAutoDefBonusesForMatchdays } from '@/lib/repo/lineup-bonus';
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
  /** Лимит времени прогона в мс (для cron/частичных прогонов). По умолчанию 80с. */
  budgetMs?: number;
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
  const budgetMs = Math.max(10_000, Math.min(options.budgetMs ?? 80_000, 120_000));
  const deadlineMs = startedAt + budgetMs;
  // Резерв под запись в БД/advance, чтобы sync успевал сохранить прогресс.
  const dbReserveMs = 5_000;
  const processingDeadlineMs = deadlineMs - dbReserveMs;
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
  let tListMs = 0;
  let tEnrichMs = 0;
  let tDbStartMs = 0;

  // Лига наций: берём из запасного источника (основной тариф её не отдаёт).
  // Запускаем до football-data, чтобы детализация/статистика UNL успевала в бюджет прогона.
  try {
    if (!env.sstatsEnabled) {
      errors.push('Лига наций: источник sstats отключён (SSTATS_ENABLED=false)');
    } else {
      const remainingMs = processingDeadlineMs - Date.now();
      if (remainingMs > 6_000) {
        const listTimeoutMs = Math.min(10_000, Math.max(3_000, remainingMs - 2_000));
        const unl = await fetchSstatsUnlFixtures({
          from: window.from,
          to: window.to,
          apiKey: env.sstatsApiKey,
          timeoutMs: listTimeoutMs,
        });
        fetchedTotal += unl.fetched;
        requestsUsed += unl.requestsUsed;
        if (httpStatus === null) httpStatus = unl.httpStatus;

        // Если в БД уже есть статистика для этих матчей (любой провайдер по тому же external_id
        // или по совпадению команды/времени в окне), не тратим бюджет на повторную детализацию.
        try {
          const extIds = unl.matches.map((m) => m.externalId);
          const existing = extIds.length
            ? await sql<{ provider: string; external_id: string; home_name: string; away_name: string; kickoff_utc: Date; stats: any }[]>`
                select provider, external_id, home_name, away_name, kickoff_utc,
                  jsonb_build_object(
                    'cornersHome', corners_home, 'cornersAway', corners_away,
                    'yellowCardsHome', yellow_cards_home, 'yellowCardsAway', yellow_cards_away,
                    'redCardsHome', red_cards_home, 'redCardsAway', red_cards_away,
                    'possessionHome', possession_home, 'possessionAway', possession_away,
                    'shotsOnTargetHome', shots_on_target_home, 'shotsOnTargetAway', shots_on_target_away
                  ) as stats
                from matches
                where provider = 'sstats' and external_id = any(${sql(extIds)})
              `
            : [];
          const hasAny = (s: any) => s && Object.values(s).some((v) => v !== null && v !== undefined);
          const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
          for (let i = 0; i < unl.matches.length; i++) {
            const m = unl.matches[i]!;
            const byId = existing.find((e) => e.provider === 'sstats' && e.external_id === m.externalId);
            const byMatch = existing.find((e) => {
              const dt = Math.abs(new Date(e.kickoff_utc).getTime() - m.kickoffUtc.getTime());
              if (dt > 6 * 60 * 60 * 1000) return false;
              const hn = norm(e.home_name), an = norm(e.away_name), ih = norm(m.homeName), ia = norm(m.awayName);
              return (hn === ih && an === ia) || ((hn.includes(ih) || ih.includes(hn)) && (an.includes(ia) || ia.includes(an)));
            });
            const found = (byId && hasAny(byId.stats)) ? byId : (byMatch && hasAny(byMatch.stats)) ? byMatch : null;
            if (found) {
              unl.matches[i] = { ...m, stats: { ...m.stats, ...(found.stats as any) } };
            }
          }
        } catch {
          // не критично — просто попробуем обогатить как обычно
        }

        tListMs = Date.now() - startedAt;
        const enrichable = unl.matches.filter(
          (m) => m.status !== 'NS' && m.status !== 'PST' && m.status !== 'CANC' && !Object.values(m.stats).some((v) => v !== null),
        ).length;
        const tEnrichStart = Date.now();
        const enriched = await enrichSstatsMatchesWithStats({
          matches: unl.matches,
          apiKey: env.sstatsApiKey,
          concurrency: 3,
          maxDetails: Math.min(20, Math.max(4, enrichable)),
          deadlineMs: processingDeadlineMs,
        });
        tEnrichMs = Date.now() - tEnrichStart;
        requestsUsed += enriched.requestsUsed;
        groups.push(enriched.matches);
      } else {
        errors.push('Лига наций: пропущено из-за лимита времени прогона');
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Источник Лиги наций недоступен';
    errors.push(`Лига наций: ${message}`);
  }

  if (hasFootballData && Date.now() < processingDeadlineMs - 4_000) {
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
  } else if (hasFootballData) {
    errors.push('football-data: пропущено из-за лимита времени прогона (приоритет UNL)');
  }

  const normalized = mergeMatches(groups);

  if (normalized.length === 0) {
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
    if (quota) {
      const reason: SyncReason = 'SYNC_QUOTA_EXCEEDED';
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

    // Источники могли частично отвалиться/вернуть пусто: не валим весь синк,
    // фиксируем ошибку в отчёте и даём следующему прогону повторить попытку.
    const errorText = errors.join('; ').slice(0, 500);
    await logSyncRun({
      endpoint: 'sync-fixtures',
      status: 'ok',
      httpStatus,
      durationMs: Date.now() - startedAt,
      requestsUsed,
      error: errorText,
      provider: 'multi',
    });
    return {
      ok: true,
      reason: null,
      fetched: fetchedTotal,
      kept: 0,
      matches: 0,
      matchdays: 0,
      questions: 0,
      durationMs: Date.now() - startedAt,
      httpStatus,
      error: errorText,
    };
  }

  const matchdayIds = new Map<string, string>();
  let savedMatches = 0;
  let createdQuestions = 0;
  let partial = false;

  const maxMatchesPerRun = 50;
  const finalStatuses = new Set(['FT', 'PST', 'CANC', 'ABD']);
  const prioritized = [...normalized].sort((a, b) => {
    const nowMsSort = now.getTime();
    const priority = (m: NormalizedMatch): number => {
      if (m.status === 'LIVE' || m.status === 'HT') return 0;
      const started = m.kickoffUtc.getTime() <= nowMsSort;
      // Матчи, которые уже должны идти/завершиться, но ещё NS/нефинальны — подтягиваем раньше будущих.
      if (started && (m.status === 'NS' || !finalStatuses.has(m.status))) return 1;
      if (finalStatuses.has(m.status)) return 2;
      return 3; // будущие NS
    };
    const aScore = priority(a);
    const bScore = priority(b);
    if (aScore !== bScore) return aScore - bScore;
    // Для live/ht и начавшихся — более ранние первыми; для финальных — более свежие первыми.
    if (aScore <= 1) return a.kickoffUtc.getTime() - b.kickoffUtc.getTime();
    if (aScore === 2) return b.kickoffUtc.getTime() - a.kickoffUtc.getTime();
    return a.kickoffUtc.getTime() - b.kickoffUtc.getTime();
  });
  const matchesToProcess = prioritized.slice(0, maxMatchesPerRun);
  if (prioritized.length > maxMatchesPerRun) {
    partial = true;
    errors.push(`Обработано ${maxMatchesPerRun} из ${prioritized.length} матчей за прогон, остаток — в следующем запуске`);
  }

  tDbStartMs = Date.now();
  await sql.begin(async (tx) => {
    const hasQuestionsCache = new Map<string, boolean>();
    const questionExists = async (matchdayId: string, matchId: string): Promise<boolean> => {
      const key = `${matchdayId}:${matchId}`;
      const cached = hasQuestionsCache.get(key);
      if (cached !== undefined) return cached;
      const rows = await tx<{ exists: boolean }[]>`
        select exists(
          select 1 from questions where matchday_id = ${matchdayId} and match_id = ${matchId}
        ) as exists
      `;
      const exists = rows[0]?.exists === true;
      hasQuestionsCache.set(key, exists);
      return exists;
    };

    const normalizeName = (s: string): string =>
      s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();

    for (const match of matchesToProcess) {
      if (Date.now() >= deadlineMs - 2_000) {
        partial = true;
        errors.push('Время прогона почти вышло: сохранён частичный прогресс, остаток будет обработан в следующем запуске');
        break;
      }

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
          home_logo = coalesce(excluded.home_logo, matches.home_logo),
          away_name = excluded.away_name,
          away_logo = coalesce(excluded.away_logo, matches.away_logo),
          kickoff_utc = excluded.kickoff_utc,
          status = excluded.status,
          minute = excluded.minute,
          home_score = excluded.home_score,
          away_score = excluded.away_score,
          ht_home_score = excluded.ht_home_score,
          ht_away_score = excluded.ht_away_score,
          corners_home = coalesce(excluded.corners_home, matches.corners_home),
          corners_away = coalesce(excluded.corners_away, matches.corners_away),
          yellow_cards_home = coalesce(excluded.yellow_cards_home, matches.yellow_cards_home),
          yellow_cards_away = coalesce(excluded.yellow_cards_away, matches.yellow_cards_away),
          red_cards_home = coalesce(excluded.red_cards_home, matches.red_cards_home),
          red_cards_away = coalesce(excluded.red_cards_away, matches.red_cards_away),
          possession_home = coalesce(excluded.possession_home, matches.possession_home),
          possession_away = coalesce(excluded.possession_away, matches.possession_away),
          shots_on_target_home = coalesce(excluded.shots_on_target_home, matches.shots_on_target_home),
          shots_on_target_away = coalesce(excluded.shots_on_target_away, matches.shots_on_target_away),
          raw = excluded.raw
        returning id
      `;

      if (!saved) continue;

      // Если этот же матч уже привязан к дню под другой записью (другой провайдер/id),
      // обновляем каноническую запись, чтобы вопросы/предикты получили актуальные счёт и статистику.
      const linked = await tx<{ id: string; provider: string; external_id: string; home_name: string; away_name: string; kickoff_utc: Date }[]>`
        select m.id, m.provider, m.external_id, m.home_name, m.away_name, m.kickoff_utc
        from matchday_matches mm
        join matches m on m.id = mm.match_id
        where mm.matchday_id = ${matchdayId}
      `;

      const targetTime = match.kickoffUtc.getTime();
      const inHome = normalizeName(match.homeName);
      const inAway = normalizeName(match.awayName);
      const teamScore = (a: string, b: string): number => {
        if (!a || !b) return 0;
        if (a === b) return 3;
        if (a.includes(b) || b.includes(a)) return 2;
        const at = new Set(a.split(' ').filter(Boolean));
        const bt = new Set(b.split(' ').filter(Boolean));
        let inter = 0;
        for (const t of at) if (bt.has(t)) inter += 1;
        return inter > 0 ? 1 : 0;
      };

      let canonical: (typeof linked)[number] | null =
        linked.find((m) => m.provider === match.provider && m.external_id === match.externalId) ?? null;

      if (!canonical) {
        let best: { m: (typeof linked)[number]; score: number; dt: number } | null = null;
        for (const m of linked) {
          const dt = Math.abs(new Date(m.kickoff_utc).getTime() - targetTime);
          if (dt > 6 * 60 * 60 * 1000) continue;
          const hn = normalizeName(m.home_name);
          const an = normalizeName(m.away_name);
          const s = teamScore(hn, inHome) + teamScore(an, inAway);
          const timeScore = dt <= 2 * 60 * 1000 ? 2 : dt <= 30 * 60 * 1000 ? 1 : 0;
          const total = s * 10 + timeScore;
          if (total <= 0) continue;
          if (!best || total > best.score || (total === best.score && dt < best.dt)) {
            best = { m, score: total, dt };
          }
        }
        if (best && best.score >= 12) canonical = best.m; // good name match or name+close time
        else if (best && best.score >= 2) canonical = best.m; // fallback (e.g. exact kickoff, weak names)
      }

      const targetMatchId = canonical?.id ?? saved.id;

      if (canonical && canonical.id !== saved.id) {
        await tx`
          update matches set
            league_code = ${match.leagueCode},
            league_title = ${match.leagueTitle},
            home_name = ${match.homeName},
            home_logo = coalesce(${match.homeLogo}, home_logo),
            away_name = ${match.awayName},
            away_logo = coalesce(${match.awayLogo}, away_logo),
            kickoff_utc = ${match.kickoffUtc},
            status = ${match.status},
            minute = ${match.minute},
            home_score = ${match.homeScore},
            away_score = ${match.awayScore},
            ht_home_score = ${match.htHomeScore},
            ht_away_score = ${match.htAwayScore},
            corners_home = coalesce(${match.stats.cornersHome}, corners_home),
            corners_away = coalesce(${match.stats.cornersAway}, corners_away),
            yellow_cards_home = coalesce(${match.stats.yellowCardsHome}, yellow_cards_home),
            yellow_cards_away = coalesce(${match.stats.yellowCardsAway}, yellow_cards_away),
            red_cards_home = coalesce(${match.stats.redCardsHome}, red_cards_home),
            red_cards_away = coalesce(${match.stats.redCardsAway}, red_cards_away),
            possession_home = coalesce(${match.stats.possessionHome}, possession_home),
            possession_away = coalesce(${match.stats.possessionAway}, possession_away),
            shots_on_target_home = coalesce(${match.stats.shotsOnTargetHome}, shots_on_target_home),
            shots_on_target_away = coalesce(${match.stats.shotsOnTargetAway}, shots_on_target_away),
            raw = ${tx.json(match.raw as any)}
          where id = ${canonical.id}
        `;
      }

      savedMatches += 1;

      await tx`
        insert into matchday_matches (matchday_id, match_id)
        values (${matchdayId}, ${targetMatchId})
        on conflict do nothing
      `;

      // Вопросы для прогнозов: создаём один раз на матч в этом игровом дне.
      if (!(await questionExists(matchdayId, targetMatchId))) {
        const seed = Math.abs(hashString(`${match.provider}:${match.externalId}`));
        const generated = generateMatchQuestions({ homeName: match.homeName, awayName: match.awayName }, seed, 4);
        for (const question of generated) {
          await tx`
            insert into questions (
              matchday_id, match_id, kind, template, prompt, options, rule,
              locks_at, is_bonus, status, source
            ) values (
              ${matchdayId}, ${targetMatchId}, ${question.kind}, ${question.rule.type}, ${question.prompt},
              ${tx.json(question.options as any)}, ${tx.json(question.rule as any)},
              ${match.kickoffUtc}, ${question.isBonus}, 'open', 'auto'
            )
          `;
          createdQuestions += 1;
        }
        hasQuestionsCache.set(`${matchdayId}:${targetMatchId}`, true);
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

  if (matchdayIds.size > 0) {
    const affectedMatchdayIds = [...new Set(matchdayIds.values())];
    try {
      await awardAutoDefBonusesForMatchdays(affectedMatchdayIds, sql);
    } catch (error) {
      errors.push(`auto DEF bonuses: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Если день уже был резолвнут без статистики, дозаполняем correct_option/is_correct
    // для вопросов, которые теперь можно вычислить по обновлённым данным матча.
    try {
      await sql`
        with computed as (
          select q.id, public.fn_question_answer(q.rule, m) as answer
          from questions q
          join matches m on m.id = q.match_id
          where q.matchday_id in ${sql(affectedMatchdayIds)}
            and m.status = 'FT'
            and q.status = 'resolved'
            and q.correct_option is null
        ), resolved_q as (
          update questions q
             set correct_option = c.answer
            from computed c
           where q.id = c.id
             and c.answer is not null
          returning q.id, q.correct_option
        )
        update answers a
           set is_correct = (a.choice = rq.correct_option)
          from resolved_q rq
         where a.question_id = rq.id
      `;
    } catch (error) {
      errors.push(`regrade: ${error instanceof Error ? error.message : String(error)}`);
    }

    // После обновления матчей/статистики двигаем дни вперёд и резолвим готовые,
    // чтобы предикты получили correct_option/is_correct и очки/кубики.
    try {
      const advanced = await advanceMatchdays(now);
      if (!advanced.ok && advanced.errors.length > 0) {
        errors.push(`advance: ${advanced.errors.join('; ').slice(0, 300)}`);
      }
    } catch (error) {
      errors.push(`advance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const timingInfo = `[timing:list=${tListMs}ms,enrich=${tEnrichMs}ms,db=${tDbStartMs ? Date.now() - tDbStartMs : 0}ms]`;
  const errorText = (errors.length ? `${errors.join('; ')} ${timingInfo}` : timingInfo).slice(0, 500);
  await logSyncRun({
    endpoint: 'sync-fixtures',
    status: 'ok',
    httpStatus,
    durationMs: Date.now() - startedAt,
    requestsUsed,
    error: errorText,
    provider: 'multi',
  });

  return {
    ok: true,
    reason: null,
    fetched: fetchedTotal,
    kept: matchesToProcess.length,
    matches: savedMatches,
    matchdays: matchdayIds.size,
    questions: createdQuestions,
    durationMs: Date.now() - startedAt,
    httpStatus,
    error: errorText,
  };
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
        try {
          await awardAutoDefBonusesForMatchdays([day.id], sql);
        } catch (error) {
          report.errors.push(
            `${day.id}: auto DEF bonuses failed: ${error instanceof Error ? error.message : String(error)}`,
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
