/**
 * Клиент sstats.net — источник матчей и счёта там, где основной провайдер
 * не отдаёт нужный турнир (например Лига наций).
 *
 * Используем публичные эндпоинты; ключ, если задан, передаётся в заголовках
 * (рекомендация sstats), но без него запросы тоже могут работать.
 */

import { AppError } from '@/lib/errors';
import { teamNameRu } from './team-names';
import { EMPTY_MATCH_STATS, type MatchStats, type NormalizedMatch } from './normalize';

const BASE_URL = 'https://api.sstats.net';
const TIMEOUT_MS = 15_000;

function shiftDateStr(date: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** date-only To в sstats исключает указанную дату (до её полуночи), поэтому +1 день для включительного конца окна. */
function toSstatsToParam(to: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(to) ? shiftDateStr(to, 1) : to;
}

export type SstatsFixtureFetch = {
  matches: NormalizedMatch[];
  fetched: number;
  httpStatus: number;
  durationMs: number;
  requestsUsed: number;
};

type SstatsTeam = { id?: number | null; name?: string | null; shortName?: string | null } | null;
type SstatsResult = { home?: number | null; away?: number | null } | null;

export type SstatsGame = {
  id: number | string;
  date?: string | null;
  dateUtc?: string | null;
  status?: number | string | null;
  statusName?: string | null;
  homeTeam?: SstatsTeam;
  awayTeam?: SstatsTeam;
  homeResult?: number | null;
  awayResult?: number | null;
  htResult?: SstatsResult;
  [key: string]: unknown;
};

function toText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const obj = value as { name?: unknown; shortName?: unknown; title?: unknown; label?: unknown };
    return toText(obj.shortName ?? obj.name ?? obj.title ?? obj.label);
  }
  return null;
}

function parseUtc(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : NaN;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const raw = toText(value);
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // "2026-11-12 19:45:00" -> трактуем как UTC
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}${trimmed.length === 16 ? ':00' : ''}Z`
    : /Z|[+-]\d{2}:?\d{2}$/i.test(trimmed)
      ? trimmed
      : `${trimmed}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function mapSstatsStatus(status: string | number | null | undefined): NormalizedMatch['status'] {
  const raw = String(status ?? '').trim();
  if (!raw) return 'NS';
  const s = raw.toLowerCase();

  // Числовые коды sstats API (см. OpenAPI /Games/{id}).
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n === 1 || n === 2) return 'NS';
    if (n === 3 || n === 5 || n === 6 || n === 7 || n === 19) return 'LIVE';
    if (n === 4 || n === 11) return 'HT';
    if (n === 8 || n === 9 || n === 10 || n === 17 || n === 18) return 'FT';
    if (n === 12 || n === 13) return 'ABD';
    if (n === 14) return 'PST';
    if (n === 15) return 'CANC';
    return 'NS';
  }

  if (s.includes('postpon')) return 'PST';
  if (s.includes('cancel')) return 'CANC';
  if (s.includes('abandon') || s.includes('suspend') || s.includes('interrupt')) return 'ABD';

  if (s.includes('finish') || s.includes('ended') || s.includes('full time') || s === 'ft' || s === 'aet' || s === 'pen') {
    return 'FT';
  }

  if (s.includes('half time') || s.includes('halftime') || s === 'ht') return 'HT';
  if (s.includes('1st half') || s.includes('2nd half') || s.includes('first half') || s.includes('second half') || s.includes('extra time') || s.includes('penalties')) {
    return 'LIVE';
  }

  if (s.includes('live') || s.includes('play') || s.includes('progress')) return 'LIVE';
  if (s.includes('not') || s.includes('sched') || s.includes('timed')) return 'NS';

  return 'NS';
}

function cleanName(name: unknown, fallback: string): string {
  const value = (toText(name) ?? '').trim();
  return value.length > 0 ? value : fallback;
}

export function normalizeSstatsUnlGame(game: SstatsGame): NormalizedMatch | null {
  const kickoffUtc = parseUtc(game.dateUtc ?? game.date ?? null);
  if (!kickoffUtc) return null;

  const homeTeam: any = game.homeTeam as any;
  const awayTeam: any = game.awayTeam as any;
  const homeName = teamNameRu(cleanName(homeTeam?.shortName ?? homeTeam?.name ?? homeTeam, 'Хозяева'));
  const awayName = teamNameRu(cleanName(awayTeam?.shortName ?? awayTeam?.name ?? awayTeam, 'Гости'));
  if (!homeName || !awayName) return null;

  const rawStatus = (game as any).status ?? (game as any).statusName;
  const status = mapSstatsStatus(rawStatus);

  const toNum = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  const homeScore = toNum((game as any).homeResult ?? (game as any).homeFTResult);
  const awayScore = toNum((game as any).awayResult ?? (game as any).awayFTResult);
  const ht = (game.htResult ?? (game as any).htResult) as any;
  const htHomeScore = toNum((game as any).homeHTResult ?? ht?.home);
  const htAwayScore = toNum((game as any).awayHTResult ?? ht?.away);
  const elapsed = toNum((game as any).elapsed);

  return {
    provider: 'sstats',
    externalId: String(game.id),
    leagueCode: 'UNL',
    leagueTitle: 'Лига наций',
    homeName,
    homeLogo: null,
    awayName,
    awayLogo: null,
    kickoffUtc,
    status,
    minute: elapsed,
    homeScore,
    awayScore,
    htHomeScore,
    htAwayScore,
    stats: { ...EMPTY_MATCH_STATS },
    raw: game,
  };
}

/**
 * Загружает матчи Лиги наций за период. From/To — даты YYYY-MM-DD.
 * Используем LeagueId=5, Year=2026 (сезон Лиги наций 2026/27, финальная стадия в ноябре 2026).
 */
export async function fetchSstatsUnlFixtures(input: {
  from: string;
  to: string;
  apiKey?: string | null;
  leagueId?: number;
  year?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<SstatsFixtureFetch> {
  const leagueId = input.leagueId ?? 5;
  const year = input.year ?? 2026;
  const url = new URL(`${BASE_URL}/games/list`);
  url.searchParams.set('LeagueId', String(leagueId));
  url.searchParams.set('Year', String(year));
  url.searchParams.set('From', input.from);
  url.searchParams.set('To', toSstatsToParam(input.to));
  // Явно задаём TZ=3 (МСК) для date-only параметров; по умолчанию в API тоже 3.
  url.searchParams.set('TimeZone', '3');
  if (input.apiKey) url.searchParams.set('apikey', input.apiKey);

  const doFetch = input.fetchImpl ?? fetch;
  const startedAt = Date.now();

  const headers: Record<string, string> = { accept: 'application/json' };
  if (input.apiKey) {
    headers['Authorization'] = `ApiKey ${input.apiKey}`;
    headers['apikey'] = input.apiKey;
  }

  let response: Response;
  try {
    response = await doFetch(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(Math.max(1000, input.timeoutMs ?? TIMEOUT_MS)),
    });
  } catch (error) {
    throw new AppError('SYNC_PROVIDER_DOWN', `Источник матчей не ответил: ${(error as Error).message}`);
  }

  const durationMs = Date.now() - startedAt;

  if (response.status === 429) {
    throw new AppError('SYNC_QUOTA_EXCEEDED');
  }
  if (!response.ok) {
    throw new AppError('SYNC_PROVIDER_DOWN', `Источник матчей вернул ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AppError('SYNC_PROVIDER_DOWN', 'Источник матчей вернул не JSON');
  }

  const games: SstatsGame[] = Array.isArray(payload)
    ? (payload as SstatsGame[])
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: SstatsGame[] }).data)
      : Array.isArray((payload as { games?: unknown })?.games)
        ? ((payload as { games: SstatsGame[] }).games)
        : [];

  const matches = games
    .map(normalizeSstatsUnlGame)
    .filter((m): m is NormalizedMatch => m !== null)
    .sort((a, b) => a.kickoffUtc.getTime() - b.kickoffUtc.getTime());

  return {
    matches,
    fetched: games.length,
    httpStatus: response.status,
    durationMs,
    requestsUsed: 1,
  };
}

function toStatNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function pickStat(obj: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!obj) return null;
  for (const key of keys) {
    const v = toStatNumber(obj[key]);
    if (v !== null) return v;
  }
  return null;
}

export function extractSstatsMatchStats(detail: unknown): MatchStats {
  const root = (detail && typeof detail === 'object' ? detail : {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const game = (data.game && typeof data.game === 'object' ? data.game : data) as Record<string, unknown>;
  const stats = (data.statistics && typeof data.statistics === 'object'
    ? data.statistics
    : game.statistics && typeof game.statistics === 'object'
      ? game.statistics
      : null) as Record<string, unknown> | null;

  const cornersHome = pickStat(stats, ['cornerKicksHome', 'cornersHome', 'homeCorners']) ?? pickStat(game, ['cornerKicksHome', 'cornersHome']);
  const cornersAway = pickStat(stats, ['cornerKicksAway', 'cornersAway', 'awayCorners']) ?? pickStat(game, ['cornerKicksAway', 'cornersAway']);
  const yellowCardsHome = pickStat(stats, ['yellowCardsHome', 'homeYellowCards']) ?? pickStat(game, ['yellowCardsHome']);
  const yellowCardsAway = pickStat(stats, ['yellowCardsAway', 'awayYellowCards']) ?? pickStat(game, ['yellowCardsAway']);
  const redCardsHome = pickStat(stats, ['redCardsHome', 'homeRedCards']) ?? pickStat(game, ['redCardsHome']);
  const redCardsAway = pickStat(stats, ['redCardsAway', 'awayRedCards']) ?? pickStat(game, ['redCardsAway']);
  const possessionHome = pickStat(stats, ['ballPossessionHome', 'possessionHome', 'homePossession']) ?? pickStat(game, ['ballPossessionHome', 'possessionHome']);
  const possessionAway = pickStat(stats, ['ballPossessionAway', 'possessionAway', 'awayPossession']) ?? pickStat(game, ['ballPossessionAway', 'possessionAway']);
  // В sstats "удары в створ" = shotsOnGoal*.
  const shotsOnTargetHome =
    pickStat(stats, ['shotsOnGoalHome', 'shotsOnTargetHome', 'homeShotsOnTarget']) ?? pickStat(game, ['shotsOnGoalHome', 'shotsOnTargetHome']);
  const shotsOnTargetAway =
    pickStat(stats, ['shotsOnGoalAway', 'shotsOnTargetAway', 'awayShotsOnTarget']) ?? pickStat(game, ['shotsOnGoalAway', 'shotsOnTargetAway']);

  return {
    cornersHome,
    cornersAway,
    yellowCardsHome,
    yellowCardsAway,
    redCardsHome,
    redCardsAway,
    possessionHome,
    possessionAway,
    shotsOnTargetHome,
    shotsOnTargetAway,
  };
}

function extractSstatsMatchCore(detail: unknown): Pick<NormalizedMatch, 'status' | 'minute' | 'homeScore' | 'awayScore' | 'htHomeScore' | 'htAwayScore'> | null {
  const root = (detail && typeof detail === 'object' ? detail : {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const game = (data.game && typeof data.game === 'object' ? data.game : data) as Record<string, unknown>;

  const toNum = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  };

  const rawStatus = (game as any).status ?? (game as any).statusName ?? (data as any).status ?? (data as any).statusName;
  const ht = (game.htResult ?? (game as any).htResult ?? (data as any).htResult) as any;
  return {
    status: mapSstatsStatus(rawStatus),
    minute: toNum((game as any).elapsed ?? (data as any).elapsed),
    homeScore: toNum((game as any).homeResult ?? (game as any).homeFTResult ?? (data as any).homeResult ?? (data as any).homeFTResult),
    awayScore: toNum((game as any).awayResult ?? (game as any).awayFTResult ?? (data as any).awayResult ?? (data as any).awayFTResult),
    htHomeScore: toNum((game as any).homeHTResult ?? ht?.home ?? (data as any).homeHTResult),
    htAwayScore: toNum((game as any).awayHTResult ?? ht?.away ?? (data as any).awayHTResult),
  };
}

export async function fetchSstatsGameDetail(input: {
  id: string | number;
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ stats: MatchStats; core: Pick<NormalizedMatch, 'status' | 'minute' | 'homeScore' | 'awayScore' | 'htHomeScore' | 'htAwayScore'> | null; requestsUsed: number }> {
  const url = new URL(`${BASE_URL}/games/${encodeURIComponent(String(input.id))}`);
  if (input.apiKey) url.searchParams.set('apikey', input.apiKey);
  const doFetch = input.fetchImpl ?? fetch;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (input.apiKey) {
    headers['Authorization'] = `ApiKey ${input.apiKey}`;
    headers['apikey'] = input.apiKey;
  }

  const timeoutMs = Math.max(1_000, input.timeoutMs ?? TIMEOUT_MS);
  const response = await doFetch(url, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new AppError('SYNC_PROVIDER_DOWN', `Детали матча недоступны: ${response.status}`);
  }
  const payload = await response.json();
  return { stats: extractSstatsMatchStats(payload), core: extractSstatsMatchCore(payload), requestsUsed: 1 };
}
export async function enrichSstatsMatchesWithStats(input: {
  matches: NormalizedMatch[];
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  concurrency?: number;
  /** Stop fetching details after this many matches (prioritised: live/ht, then recent FT needing stats). */
  maxDetails?: number;
  /** Abort enrichment when past this timestamp (ms). */
  deadlineMs?: number;
}): Promise<{ matches: NormalizedMatch[]; requestsUsed: number }> {
  const concurrency = Math.max(1, input.concurrency ?? 4);
  const maxDetails = Math.max(0, input.maxDetails ?? 40);
  const results: NormalizedMatch[] = new Array(input.matches.length);
  let requestsUsed = 0;

  const hasAnyStat = (m: NormalizedMatch): boolean => {
    const s = m.stats;
    return Object.values(s).some((v) => v !== null);
  };

  const toEnrich: Array<{ index: number; match: NormalizedMatch; priority: number }> = [];
  for (let i = 0; i < input.matches.length; i += 1) {
    const match = input.matches[i]!;
    if (match.provider !== 'sstats') {
      results[i] = match;
      continue;
    }
    // Для ещё не начавшихся/отменённых матчей статистики обычно нет — пропускаем лишние запросы.
    if (match.status === 'NS' || match.status === 'PST' || match.status === 'CANC') {
      results[i] = match;
      continue;
    }
    // Для завершённых матчей повторно тянем детали, пока нет статистики (нужно для резолва предиктов).
    if (match.status === 'FT' && hasAnyStat(match)) {
      results[i] = match;
      continue;
    }
    const livePriority = match.status === 'LIVE' || match.status === 'HT' ? 0 : 1;
    toEnrich.push({ index: i, match, priority: livePriority });
  }

  // Приоритет: live/ht, затем более свежие матчи.
  toEnrich.sort((a, b) => a.priority - b.priority || b.match.kickoffUtc.getTime() - a.match.kickoffUtc.getTime());
  const selected = new Set(toEnrich.slice(0, maxDetails).map((x) => x.index));
  for (const item of toEnrich) {
    if (!selected.has(item.index)) results[item.index] = item.match;
  }

  const queue = toEnrich.filter((x) => selected.has(x.index));
  for (let i = 0; i < queue.length; i += concurrency) {
    if (input.deadlineMs) {
      const remainingMs = input.deadlineMs - Date.now();
      if (remainingMs <= 1_000) {
        for (let j = i; j < queue.length; j += 1) results[queue[j]!.index] = queue[j]!.match;
        break;
      }
    }
    const chunk = queue.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async ({ index, match }) => {
        try {
          const remainingMs = input.deadlineMs ? input.deadlineMs - Date.now() : TIMEOUT_MS;
          if (input.deadlineMs && remainingMs <= 800) {
            return { index, match, requestsUsed: 0 };
          }
          const timeoutMs = input.deadlineMs ? Math.min(TIMEOUT_MS, Math.max(1_000, remainingMs - 200)) : TIMEOUT_MS;
          const detail = await fetchSstatsGameDetail({
            id: match.externalId,
            apiKey: input.apiKey,
            fetchImpl: input.fetchImpl,
            timeoutMs,
          });
          const rank = (st: NormalizedMatch['status']): number => {
            if (st === 'FT' || st === 'PST' || st === 'CANC' || st === 'ABD') return 3;
            if (st === 'LIVE' || st === 'HT') return 2;
            return 1; // NS/unknown
          };
          const core = detail.core;
          const merged: NormalizedMatch = { ...match, stats: detail.stats };
          if (core) {
            // Детали матча обычно свежее списка: обновляем статус/счёт/минуту, если есть прогресс.
            if (rank(core.status) >= rank(match.status)) merged.status = core.status;
            if (core.minute !== null) merged.minute = core.minute;
            if (core.homeScore !== null) merged.homeScore = core.homeScore;
            if (core.awayScore !== null) merged.awayScore = core.awayScore;
            if (core.htHomeScore !== null) merged.htHomeScore = core.htHomeScore;
            if (core.htAwayScore !== null) merged.htAwayScore = core.htAwayScore;
          }

          return { index, match: merged, requestsUsed: detail.requestsUsed };
        } catch {
          // Если детали недоступны, оставляем матч без обновления статистики/статуса.
          return { index, match, requestsUsed: 0 };
        }
      }),
    );
    for (const item of chunkResults) {
      results[item.index] = item.match;
      requestsUsed += item.requestsUsed;
    }
  }

  return { matches: results, requestsUsed };
}
