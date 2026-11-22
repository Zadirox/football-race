/**
 * Слой футбольных данных: общий оркестратор синка.
 *
 * Вход: cron-эндпоинты (ручной/расписание).
 * Выход: актуальные матчи/матчдэи/вопросы в БД + sync_runs.
 * Важно: не бросать 500 наружу — нормализовать ответы и логировать ошибки.
 */

import { db } from '@/lib/db';
import { hasDatabase, serverEnv } from '@/lib/env';
import { fetchFixtures, fetchFootballDataMatch } from '@/lib/data/footballData';
import { enrichSstatsMatchesWithStats, fetchSstatsFixtures, fetchSstatsGameDetail, fetchSstatsUnlFixtures } from '@/lib/data/sstats';
import { normalizeMatch, normalizeMatches, type NormalizedMatch } from '@/lib/data/normalize';
import { generateMatchQuestions } from '@/lib/data/questions';
import { teamNameRu } from '@/lib/data/team-names';
import { syncWindow } from '@/lib/data/sync-window';
import { isAppError } from '@/lib/errors';
import { grantPacksForResolvedMatchday } from '@/lib/repo/cards-grants';
import { CLUB_COMPETITIONS, CLUB_COMPETITION_BY_LEAGUE_CODE, isClubMatchAllowedForCompetition } from '@/lib/data/club-phase';
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
  /** Окно дат (YYYY-MM-DD), перекрывает авто-окно. */
  window?: { from: GameDate; to: GameDate };
  /** Лимит времени sync в мс (для cron/прокси). По умолчанию 80с. */
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
    // Лог не должен ломать sync: ошибка в логах, данные от этого не теряются.
    console.error('Не удалось записать sync_runs:', error);
  }
}

function mergeMatches(groups: NormalizedMatch[][]): NormalizedMatch[] {
  // Last write wins by provider:externalId; callers should push lower-priority groups first.
  const map = new Map<string, NormalizedMatch>();
  for (const group of groups) {
    for (const match of group) {
      map.set(`${match.provider}:${match.externalId}`, match);
    }
  }
  return [...map.values()].sort((a, b) => a.kickoffUtc.getTime() - b.kickoffUtc.getTime());
}

function getRawTeamNames(raw: unknown): { home: string[]; away: string[] } {
  const r = raw as any;
  const home = [r?.homeTeam?.name, r?.homeTeam?.shortName].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  const away = [r?.awayTeam?.name, r?.awayTeam?.shortName].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return { home, away };
}

function clubMatchInWhitelistScope(match: NormalizedMatch): boolean {
  const rawNames = getRawTeamNames(match.raw);
  const homeCandidates = [match.homeName, ...rawNames.home];
  const awayCandidates = [match.awayName, ...rawNames.away];
  for (const h of homeCandidates) {
    for (const a of awayCandidates) {
      if (isClubMatchAllowedForCompetition(h, a, match.leagueCode)) return true;
    }
  }
  return false;
}

function isQuotaError(error: unknown): boolean {
  if (isAppError(error) && error.code === 'SYNC_QUOTA_EXCEEDED') return true;
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes('quota') || msg.includes('429');
}

export async function syncFixtures(options: SyncFixturesOptions = {}): Promise<SyncFixturesReport> {
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  const budgetMs = Math.max(10_000, Math.min(options.budgetMs ?? 80_000, 120_000));
  const deadlineMs = startedAt + budgetMs;
  // Резерв под DB/advance, чтобы sync успел завершить запись.
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
  const fdGroups: NormalizedMatch[][] = [];
  const sstatsGroups: NormalizedMatch[][] = [];
  let unlMatches: NormalizedMatch[] = [];
  let tListMs = 0;
  let tEnrichMs = 0;
  let tDbStartMs = 0;

  // 1) UNL (national contour, sstats) — как раньше.
  try {
    if (!env.sstatsEnabled) {
      errors.push('Лига Наций: источник sstats отключён (SSTATS_ENABLED=false)');
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
        unlMatches = unl.matches;

        // Попытка переиспользовать уже сохранённую статистику (по external_id/матчу) из БД.
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
          // Не критично: просто без переиспользования статистики.
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
        unlMatches = enriched.matches;
        sstatsGroups.push(unlMatches);
      } else {
        errors.push('Лига Наций: недостаточно бюджета на fetch');
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка получения Лиги Наций';
    errors.push(`Лига Наций: ${message}`);
  }

  // 2) football-data first (B): reserve/guarantee FD before slow sstats club comp loop, so FD is not starved.
  if (hasFootballData && Date.now() < processingDeadlineMs - 4_000) {
    try {
      const fixtures = await fetchFixtures({ token: env.footballDataToken!, from: window.from, to: window.to });
      fetchedTotal += fixtures.matches.length;
      requestsUsed += fixtures.requestsUsed;
      httpStatus = fixtures.httpStatus;
      fdGroups.push(normalizeMatches(fixtures.matches));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка получения матчей';
      errors.push(message);
      if (isQuotaError(error)) {
        // quota отмечена в errors; ниже обработается как reason при отсутствии данных
      }
    }
  } else if (hasFootballData) {
    errors.push('football-data: недостаточно бюджета на fetch');
  }

  // 3) Club competitions (Stage 3 B, Y4): sstats primary, all comps best-effort, euro-cups priority.
  let clubFetched = 0;
  let clubKept = 0;
  let clubSkippedNoBudget = 0;
  if (env.sstatsEnabled) {
    const clubPriority = [...CLUB_COMPETITIONS].sort((a, b) => {
      const pa = a.kind === 'europe_cup' ? 0 : 1;
      const pb = b.kind === 'europe_cup' ? 0 : 1;
      return pa - pb;
    });
    const rotateBy = Math.floor(Date.now() / 60_000) % Math.max(1, clubPriority.length);
    const rotatedClubPriority = [...clubPriority.slice(rotateBy), ...clubPriority.slice(0, rotateBy)];

    let clubConsecutiveFailures = 0;
    for (const comp of rotatedClubPriority) {
      const remainingMs = processingDeadlineMs - Date.now();
      if (remainingMs <= 4_000) {
        clubSkippedNoBudget += 1;
        continue;
      }

      try {
        const baseTimeout = clubConsecutiveFailures >= 2 ? 5_000 : 10_000;
        const listTimeoutMs = Math.min(baseTimeout, Math.max(2_500, remainingMs - 1_500));
        const res = await fetchSstatsFixtures({
          leagueId: comp.sstatsLeagueId,
          year: comp.year,
          leagueCode: comp.leagueCode,
          leagueTitle: comp.short || comp.title,
          from: window.from,
          to: window.to,
          apiKey: env.sstatsApiKey,
          timeoutMs: listTimeoutMs,
        });
        fetchedTotal += res.fetched;
        requestsUsed += res.requestsUsed;
        clubFetched += res.fetched;
        if (httpStatus === null) httpStatus = res.httpStatus;

        let scoped = res.matches;
        if (comp.scope === 'whitelist_only') {
          scoped = scoped.filter(clubMatchInWhitelistScope);
        }
        clubKept += scoped.length;
        if (scoped.length > 0) sstatsGroups.push(scoped);
        clubConsecutiveFailures = 0;
      } catch (error) {
        clubConsecutiveFailures += 1;
        if (isQuotaError(error)) {
          errors.push(`club/${comp.key}: quota exceeded`);
          break;
        }
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`club/${comp.key}: ${message}`);
        if (clubConsecutiveFailures >= 3 && remainingMs < 20_000) {
          errors.push('club: sstats нестабилен, пропускаю оставшиеся comps в этом прогоне');
          break;
        }
      }
    }

    if (clubSkippedNoBudget > 0) {
      errors.push(`club: пропущено comps из-за бюджета: ${clubSkippedNoBudget}`);
    }
  }

  // Enrich club sstats matches with detail stats (corners/cards/possession/shots).
  // UNL was enriched earlier; club comps were not. Enrich any remaining sstats matches.
  const allSstatsFlat = sstatsGroups.flat();
  const needsStatEnrich = allSstatsFlat.filter(
    (m) => m.provider === 'sstats' && m.status !== 'NS' && m.status !== 'PST' && m.status !== 'CANC' && !Object.values(m.stats).some((v) => v !== null),
  ).length;
  if (needsStatEnrich > 0 && processingDeadlineMs - Date.now() > 6_000) {
    try {
      const enrichStart = Date.now();
      const enrichedSstats = await enrichSstatsMatchesWithStats({
        matches: allSstatsFlat,
        apiKey: env.sstatsApiKey,
        concurrency: 3,
        maxDetails: Math.min(30, Math.max(4, needsStatEnrich)),
        deadlineMs: processingDeadlineMs,
      });
      requestsUsed += enrichedSstats.requestsUsed;
      tEnrichMs += Date.now() - enrichStart;
      sstatsGroups.length = 0;
      sstatsGroups.push(enrichedSstats.matches);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`club-enrich: ${message}`);
    }
  }

  // Merge with sstats priority on provider:externalId conflicts.
  const normalized = mergeMatches([...fdGroups, ...sstatsGroups]);

  // Propagate stats from sstats matches to same-game football-data matches.
  // FD has no corners/cards/possession/SOT; stat questions on FD matches need them.
  {
    const normTeam = (s: string) => teamNameRu(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
    const hasStats = (m: NormalizedMatch) => Object.values(m.stats).some((v) => v !== null);
    const sstatsWithStats = normalized.filter((m) => m.provider === 'sstats' && hasStats(m));
    if (sstatsWithStats.length > 0) {
      for (let i = 0; i < normalized.length; i++) {
        const m = normalized[i]!;
        if (m.provider === 'sstats' || hasStats(m)) continue;
        if (m.status === 'NS' || m.status === 'PST' || m.status === 'CANC') continue;
        const mh = normTeam(m.homeName);
        const ma = normTeam(m.awayName);
        const mt = m.kickoffUtc.getTime();
        const donor = sstatsWithStats.find((s) => {
          const dt = Math.abs(s.kickoffUtc.getTime() - mt);
          if (dt > 6 * 60 * 60 * 1000) return false;
          const sh = normTeam(s.homeName);
          const sa = normTeam(s.awayName);
          const homeOk = sh === mh || sh.includes(mh) || mh.includes(sh);
          const awayOk = sa === ma || sa.includes(ma) || ma.includes(sa);
          return homeOk && awayOk;
        });
        if (donor) normalized[i] = { ...m, stats: { ...m.stats, ...donor.stats } };
      }
    }
  }

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

  // Scope filter (B): attach only UNL + in-scope club comps. Whitelist-only comps require whitelist team.
  const clubLeagueCodes = new Set(CLUB_COMPETITIONS.map((c) => c.leagueCode));
  const inScopeNormalized: NormalizedMatch[] = [];
  let excludedOutOfScope = 0;
  for (const m of normalized) {
    if (m.leagueCode === 'UNL') {
      inScopeNormalized.push(m);
      continue;
    }
    const comp = CLUB_COMPETITION_BY_LEAGUE_CODE[m.leagueCode];
    if (!comp) {
      excludedOutOfScope += 1;
      continue;
    }
    if (comp.scope === 'whitelist_only' && !clubMatchInWhitelistScope(m)) {
      excludedOutOfScope += 1;
      continue;
    }
    inScopeNormalized.push(m);
  }
  if (excludedOutOfScope > 0) {
    errors.push(`scope: исключено матчей вне whitelist/scope: ${excludedOutOfScope}`);
  }

  // Targeted refresh: /matches window listing can miss updates for some comps/matches.
  // For in-scope, not-final matches in window, fetch by provider ID (budgeted).
  try {
    const staleRows = await sql<{
      id: string; provider: string; external_id: string; league_code: string; league_title: string;
      home_name: string; home_logo: string | null; away_name: string; away_logo: string | null;
      kickoff_utc: Date; status: string; minute: number | null;
      home_score: number | null; away_score: number | null; ht_home_score: number | null; ht_away_score: number | null;
      corners_home: number | null; corners_away: number | null; yellow_cards_home: number | null; yellow_cards_away: number | null;
      red_cards_home: number | null; red_cards_away: number | null; possession_home: number | null; possession_away: number | null;
      shots_on_target_home: number | null; shots_on_target_away: number | null;
    }[]>`
      select m.id, m.provider, m.external_id, m.league_code, m.league_title,
             m.home_name, m.home_logo, m.away_name, m.away_logo,
             m.kickoff_utc, m.status, m.minute,
             m.home_score, m.away_score, m.ht_home_score, m.ht_away_score,
             m.corners_home, m.corners_away, m.yellow_cards_home, m.yellow_cards_away,
             m.red_cards_home, m.red_cards_away, m.possession_home, m.possession_away,
             m.shots_on_target_home, m.shots_on_target_away
      from matchday_matches mm
      join matchdays md on md.id = mm.matchday_id
      join matches m on m.id = mm.match_id
      where md.season_id = ${season.id}
        and md.game_date >= ${window.from}::date
        and md.game_date <= ${window.to}::date
        and mm.in_scope = true
        and m.status not in ('FT','PST','CANC','ABD')
        and m.kickoff_utc <= now() + interval '2 hours'
      order by m.kickoff_utc asc
      limit 12
    `;
    const seen = new Set(normalized.map((m) => `${m.provider}:${m.externalId}`));
    let refreshBudget = 6; // protect FD quota / cron budget
    for (const row of staleRows) {
      if (refreshBudget <= 0) break;
      if (Date.now() >= processingDeadlineMs - 4_000) break;
      const key = `${row.provider}:${row.external_id}`;
      // Refresh even if already in window listing: listing can be stale (NS/old minute/score).
      if (seen.has(key)) {
        // replace stale entry so refreshed data wins in merge/processing
        for (let i = normalized.length - 1; i >= 0; i--) {
          if (`${normalized[i]!.provider}:${normalized[i]!.externalId}` === key) normalized.splice(i, 1);
        }
        for (let i = inScopeNormalized.length - 1; i >= 0; i--) {
          if (`${inScopeNormalized[i]!.provider}:${inScopeNormalized[i]!.externalId}` === key) inScopeNormalized.splice(i, 1);
        }
      }
      try {
        if (row.provider === 'football-data' && hasFootballData) {
          refreshBudget -= 1;
          requestsUsed += 1;
          fetchedTotal += 1;
          const fd = await fetchFootballDataMatch({ token: env.footballDataToken!, matchId: row.external_id });
          if (fd.httpStatus) httpStatus = fd.httpStatus;
          if (fd.match) {
            const nm = normalizeMatch(fd.match);
            if (nm) {
              normalized.push(nm);
              // also include in inScopeNormalized if it passes scope rules
              if (nm.leagueCode === 'UNL') inScopeNormalized.push(nm);
              else {
                const comp = CLUB_COMPETITION_BY_LEAGUE_CODE[nm.leagueCode];
                if (comp && (comp.scope !== 'whitelist_only' || clubMatchInWhitelistScope(nm))) inScopeNormalized.push(nm);
              }
              seen.add(key);
            }
          }
        } else if (row.provider === 'sstats' && env.sstatsEnabled) {
          refreshBudget -= 1;
          requestsUsed += 1;
          const detail = await fetchSstatsGameDetail({
            id: row.external_id,
            apiKey: env.sstatsApiKey,
            timeoutMs: 8_000,
          });
          const core = detail.core;
          const nm: NormalizedMatch = {
            provider: 'sstats',
            externalId: row.external_id,
            leagueCode: row.league_code,
            leagueTitle: row.league_title,
            homeName: row.home_name,
            homeLogo: row.home_logo,
            awayName: row.away_name,
            awayLogo: row.away_logo,
            kickoffUtc: new Date(row.kickoff_utc),
            status: (core?.status ?? row.status) as NormalizedMatch['status'],
            minute: core?.minute ?? row.minute,
            homeScore: core?.homeScore ?? row.home_score,
            awayScore: core?.awayScore ?? row.away_score,
            htHomeScore: core?.htHomeScore ?? row.ht_home_score,
            htAwayScore: core?.htAwayScore ?? row.ht_away_score,
            stats: {
              cornersHome: detail.stats.cornersHome ?? row.corners_home,
              cornersAway: detail.stats.cornersAway ?? row.corners_away,
              yellowCardsHome: detail.stats.yellowCardsHome ?? row.yellow_cards_home,
              yellowCardsAway: detail.stats.yellowCardsAway ?? row.yellow_cards_away,
              redCardsHome: detail.stats.redCardsHome ?? row.red_cards_home,
              redCardsAway: detail.stats.redCardsAway ?? row.red_cards_away,
              possessionHome: detail.stats.possessionHome ?? row.possession_home,
              possessionAway: detail.stats.possessionAway ?? row.possession_away,
              shotsOnTargetHome: detail.stats.shotsOnTargetHome ?? row.shots_on_target_home,
              shotsOnTargetAway: detail.stats.shotsOnTargetAway ?? row.shots_on_target_away,
            },
            raw: { refresh: 'detail', externalId: row.external_id, at: now.toISOString() },
          };
          normalized.push(nm);
          if (nm.leagueCode === 'UNL') inScopeNormalized.push(nm);
          else {
            const comp = CLUB_COMPETITION_BY_LEAGUE_CODE[nm.leagueCode];
            if (comp && (comp.scope !== 'whitelist_only' || clubMatchInWhitelistScope(nm))) inScopeNormalized.push(nm);
          }
          seen.add(key);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`refresh/${row.provider}/${row.external_id}: ${message}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`targeted-refresh: ${message}`);
  }

  // 3.1=A: dates with national (UNL) in-scope matches are national-only; exclude club matches on those dates.
  const nationalDates = new Set<GameDate>();
  for (const m of inScopeNormalized) {
    if (m.leagueCode === 'UNL') nationalDates.add(gameDateOf(m.kickoffUtc));
  }

  const matchdayIds = new Map<string, string>();
  let savedMatches = 0;
  let createdQuestions = 0;
  let partial = false;
  let excludedClubOnNationalDate = 0;

  const maxMatchesPerRun = 50;
  const finalStatuses = new Set(['FT', 'PST', 'CANC', 'ABD']);
  const prioritized = [...inScopeNormalized].sort((a, b) => {
    const nowMsSort = now.getTime();
    const priority = (m: NormalizedMatch): number => {
      if (m.status === 'LIVE' || m.status === 'HT') return 0;
      const started = m.kickoffUtc.getTime() <= nowMsSort;
      if (started && (m.status === 'NS' || !finalStatuses.has(m.status))) return 1;
      if (finalStatuses.has(m.status)) return 2;
      return 3; // будущие NS
    };
    const aScore = priority(a);
    const bScore = priority(b);
    if (aScore !== bScore) return aScore - bScore;
    if (aScore <= 1) return a.kickoffUtc.getTime() - b.kickoffUtc.getTime();
    if (aScore === 2) return b.kickoffUtc.getTime() - a.kickoffUtc.getTime();
    return a.kickoffUtc.getTime() - b.kickoffUtc.getTime();
  });

  const eligibleForProcessing: NormalizedMatch[] = [];
  for (const match of prioritized) {
    const gameDate = gameDateOf(match.kickoffUtc);
    const isClubMatch = clubLeagueCodes.has(match.leagueCode);
    if (isClubMatch && nationalDates.has(gameDate)) {
      excludedClubOnNationalDate += 1;
      continue;
    }
    eligibleForProcessing.push(match);
  }
  if (excludedClubOnNationalDate > 0) {
    errors.push(`3.1=A: исключено club-матчей на national-даты: ${excludedClubOnNationalDate}`);
  }

  // Prefer matches not yet attached in window to avoid starving the tail of the queue.
  let prioritizedProcessing = eligibleForProcessing;
  let unattachedCount = 0;
  if (eligibleForProcessing.length > 0) {
    const attachedRows = await sql<{ match_id: string }[]>`
      select mm.match_id
      from matchday_matches mm
      join matchdays md on md.id = mm.matchday_id
      where md.season_id = ${season.id}
        and md.game_date >= ${window.from}::date
        and md.game_date <= ${window.to}::date
    `;
    const attachedByKey = new Set(attachedRows.map((r) => r.match_id));
    const providers = eligibleForProcessing.map((m) => m.provider);
    const extIds = eligibleForProcessing.map((m) => m.externalId);
    const idRows = await sql<{ id: string; provider: string; external_id: string }[]>`
      select m.id, m.provider, m.external_id
      from matches m
      where (m.provider, m.external_id) in (
        select * from unnest(${providers}::text[], ${extIds}::text[])
      )
    `;
    const matchIdByKey = new Map(idRows.map((r) => [`${r.provider}:${r.external_id}`, r.id]));
    const head: NormalizedMatch[] = [];
    const tail: NormalizedMatch[] = [];
    for (const m of eligibleForProcessing) {
      const mid = matchIdByKey.get(`${m.provider}:${m.externalId}`);
      if (mid && attachedByKey.has(mid)) tail.push(m);
      else head.push(m);
    }
    // Rotate head so budget breaks don't starve the same tail matches every run.
    const rotateBy = head.length > 0 ? (Math.floor(startedAt / 60_000) % head.length) : 0;
    const rotatedHead = rotateBy > 0 ? [...head.slice(rotateBy), ...head.slice(0, rotateBy)] : head;
    unattachedCount = rotatedHead.length;
    prioritizedProcessing = [...rotatedHead, ...tail];
  }

  // Process all eligible in priority order; deadline break inside loop prevents overruns.
  // Unattached-first ordering means progress is made on missing matches each run.
  const matchesToProcess = prioritizedProcessing;

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
      teamNameRu(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();

    for (const match of matchesToProcess) {
      if (Date.now() >= deadlineMs - 2_000) {
        partial = true;
        errors.push('Таймаут sync: достигнут лимит, остаток будет обработан в следующем прогоне');
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
        if (!matchday) throw new Error('Не удалось создать/получить матчдэй');
        matchdayId = matchday.id;
        matchdayIds.set(gameDate, matchdayId);
      }

      const fallbackMinute = match.minute ?? (
        match.status === 'HT' ? 45 :
        match.status === 'FT' ? 90 :
        match.status === 'LIVE' ? Math.max(1, Math.min(130, Math.floor((Date.now() - match.kickoffUtc.getTime()) / 60000))) :
        null
      );

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
          ${fallbackMinute},
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
          status = case
            when matches.status in ('FT','PST','CANC','ABD') and excluded.status in ('NS','LIVE','HT') then matches.status
            when matches.status in ('LIVE','HT') and excluded.status = 'NS' then matches.status
            else excluded.status
          end,
          minute = case
            when excluded.status = 'NS' then matches.minute
            else coalesce(excluded.minute, matches.minute)
          end,
          home_score = case
            when excluded.status = 'NS' then matches.home_score
            else coalesce(excluded.home_score, matches.home_score)
          end,
          away_score = case
            when excluded.status = 'NS' then matches.away_score
            else coalesce(excluded.away_score, matches.away_score)
          end,
          ht_home_score = case
            when excluded.status = 'NS' then matches.ht_home_score
            else coalesce(excluded.ht_home_score, matches.ht_home_score)
          end,
          ht_away_score = case
            when excluded.status = 'NS' then matches.ht_away_score
            else coalesce(excluded.ht_away_score, matches.ht_away_score)
          end,
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

      // Поиск канонического матча в матчдэе (тот же матч, другой provider/id) для дедупа.
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
        // Require at least some team-name overlap; time-only proximity must not merge different matches.
        if (best && best.score >= 10) canonical = best.m;
      }

      const targetMatchId = canonical?.id ?? saved.id;

      // Приоритет sstats при конфликте: не перезаписывать sstats-каноникал данными другого провайдера.
      const shouldOverwriteCanonical =
        canonical &&
        canonical.id !== saved.id &&
        !(canonical.provider === 'sstats' && match.provider !== 'sstats');

      if (shouldOverwriteCanonical) {
        await tx`
          update matches set
            league_code = ${match.leagueCode},
            league_title = ${match.leagueTitle},
            home_name = ${match.homeName},
            home_logo = coalesce(${match.homeLogo}, home_logo),
            away_name = ${match.awayName},
            away_logo = coalesce(${match.awayLogo}, away_logo),
            kickoff_utc = ${match.kickoffUtc},
            status = case
              when status in ('FT','PST','CANC','ABD') and ${match.status} in ('NS','LIVE','HT') then status
              when status in ('LIVE','HT') and ${match.status} = 'NS' then status
              else ${match.status}
            end,
            minute = case when ${match.status} = 'NS' then minute else coalesce(${fallbackMinute}, minute) end,
            home_score = case when ${match.status} = 'NS' then home_score else coalesce(${match.homeScore}, home_score) end,
            away_score = case when ${match.status} = 'NS' then away_score else coalesce(${match.awayScore}, away_score) end,
            ht_home_score = case when ${match.status} = 'NS' then ht_home_score else coalesce(${match.htHomeScore}, ht_home_score) end,
            ht_away_score = case when ${match.status} = 'NS' then ht_away_score else coalesce(${match.htAwayScore}, ht_away_score) end,
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
          where id = ${canonical!.id}
        `;
      }

      savedMatches += 1;

      await tx`
        insert into matchday_matches (matchday_id, match_id)
        values (${matchdayId}, ${targetMatchId})
        on conflict do nothing
      `;

      // Вопросы генерируем один раз на матч в матчдэе.
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

    // Обновить q_total матчдэев.
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

    // Backfill: resolve/grade questions when stats become available after initial resolve.
    try {
      // 1) Resolved questions missing correct_option (stats arrived late).
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

      // 2) Open/locked questions on FT matches where answer is now computable.
      //    Covers orphaned questions in already-resolved matchdays and late stat arrival.
      const newlyResolved = await sql<{ matchday_id: string; resolved_at: string | null }[]>`
        with computed as (
          select q.id, q.matchday_id, public.fn_question_answer(q.rule, m) as answer
          from questions q
          join matches m on m.id = q.match_id
          where q.matchday_id in ${sql(affectedMatchdayIds)}
            and m.status = 'FT'
            and q.status in ('open', 'locked')
        ), updated_q as (
          update questions q
             set correct_option = c.answer,
                 status = 'resolved'
            from computed c
           where q.id = c.id
             and c.answer is not null
          returning q.id, q.matchday_id, q.correct_option
        ), graded as (
          update answers a
             set is_correct = (a.choice = uq.correct_option)
            from updated_q uq
           where a.question_id = uq.id
          returning a.question_id
        )
        select distinct uq.matchday_id, md.resolved_at::text as resolved_at
          from updated_q uq
          join matchdays md on md.id = uq.matchday_id
      `;

      // 3) Re-resolve already-resolved matchdays that got newly-resolved questions so
      //    score_events/dice/Q are recomputed. rpc_resolve_matchday is idempotent-ish:
      //    score_events/dice use ON CONFLICT DO NOTHING; Q and resolved_at are recalculated.
      const toReResolve = newlyResolved.filter((r) => r.resolved_at !== null).map((r) => r.matchday_id);
      for (const mdId of toReResolve) {
        await sql`update matchdays set resolved_at = null where id = ${mdId} and resolved_at is not null`;
        await sql`select public.rpc_resolve_matchday(${mdId}::uuid)`;
      }
    } catch (error) {
      errors.push(`regrade: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const advanced = await advanceMatchdays(now);
      if (!advanced.ok && advanced.errors.length > 0) {
        errors.push(`advance: ${advanced.errors.join('; ').slice(0, 300)}`);
      }
    } catch (error) {
      errors.push(`advance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const timingInfo = `[timing:list=${tListMs}ms,enrich=${tEnrichMs}ms,db=${tDbStartMs ? Date.now() - tDbStartMs : 0}ms,clubFetched=${clubFetched},clubKept=${clubKept}]`;
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
    kept: savedMatches,
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
 * Продвигает статусы матчдэев по времени и состоянию матчей.
 * Резолвит через `rpc_resolve_matchday`; после успеха триггерит гранты паков (Stage 2).
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

    // Если есть не-финальные матчи — не блокируем, но void незакрытые вопросы.
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
          const grantResult = await grantPacksForResolvedMatchday(day.id, day.season_id, sql);
          if (
            grantResult.contour === 'ambiguous' ||
            (grantResult.contour === 'none' && grantResult.reason && grantResult.reason !== 'cards_disabled')
          ) {
            // Fail-safe (Stage 2 B): no auto-grant on ambiguous/unclassified matchday.
            console.info(
              `[advanceMatchdays] pack grant skipped for ${day.id}: contour=${grantResult.contour} reason=${grantResult.reason ?? 'n/a'}`,
            );
          }
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
