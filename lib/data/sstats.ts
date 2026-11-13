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
  const s = String(status ?? '').toLowerCase().trim();
  if (!s) return 'NS';

  if (s.includes('finish') || s.includes('ended') || s.includes('full time') || s === 'ft' || s === 'aet' || s === 'pen' || s === '3') {
    return 'FT';
  }
  if (s.includes('postpon')) return 'PST';
  if (s.includes('cancel')) return 'CANC';
  if (s.includes('abandon') || s.includes('suspend') || s.includes('interrupt')) return 'ABD';
  if (s.includes('half')) {
    if (s.includes('1st') || s.includes('2nd') || s.includes('first') || s.includes('second')) return 'LIVE';
    return 'HT';
  }
  if (s.includes('live') || s.includes('play') || s.includes('progress')) {
    return 'LIVE';
  }
  if (s.includes('not') || s.includes('sched') || s.includes('timed')) return 'NS';

  // Числовые коды (на случай если придут без имени статуса).
  if (s === '1') return 'NS';
  if (s === '2') return 'LIVE';
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

  const status = mapSstatsStatus(toText((game as any).statusName ?? (game as any).status) ?? (game as any).status);
  const toNum = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  };
  const homeScore = toNum(game.homeResult);
  const awayScore = toNum(game.awayResult);
  const ht = (game.htResult ?? (game as any).htResult) as any;
  const htHomeScore = toNum(ht?.home);
  const htAwayScore = toNum(ht?.away);

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
    minute: null,
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
}): Promise<SstatsFixtureFetch> {
  const leagueId = input.leagueId ?? 5;
  const year = input.year ?? 2026;
  const url = new URL(`${BASE_URL}/games/list`);
  url.searchParams.set('LeagueId', String(leagueId));
  url.searchParams.set('Year', String(year));
  url.searchParams.set('From', input.from);
  url.searchParams.set('To', input.to);

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
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
  const shotsOnTargetHome = pickStat(stats, ['shotsOnTargetHome', 'homeShotsOnTarget']) ?? pickStat(game, ['shotsOnTargetHome']);
  const shotsOnTargetAway = pickStat(stats, ['shotsOnTargetAway', 'awayShotsOnTarget']) ?? pickStat(game, ['shotsOnTargetAway']);

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

export async function fetchSstatsGameDetail(input: {
  id: string | number;
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ stats: MatchStats; requestsUsed: number }> {
  const url = new URL(`${BASE_URL}/Games/${encodeURIComponent(String(input.id))}`);
  const doFetch = input.fetchImpl ?? fetch;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (input.apiKey) {
    headers['Authorization'] = `ApiKey ${input.apiKey}`;
    headers['apikey'] = input.apiKey;
  }

  const response = await doFetch(url, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new AppError('SYNC_PROVIDER_DOWN', `Детали матча вернули ${response.status}`);
  }
  const payload = await response.json();
  return { stats: extractSstatsMatchStats(payload), requestsUsed: 1 };
}

export async function enrichSstatsMatchesWithStats(input: {
  matches: NormalizedMatch[];
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ matches: NormalizedMatch[]; requestsUsed: number }> {
  let requestsUsed = 0;
  const enriched: NormalizedMatch[] = [];

  for (const match of input.matches) {
    if (match.provider !== 'sstats') {
      enriched.push(match);
      continue;
    }
    // Для ещё не начавшихся матчей статистики обычно нет — пропускаем лишние запросы.
    if (match.status === 'NS' || match.status === 'PST' || match.status === 'CANC') {
      enriched.push(match);
      continue;
    }
    try {
      const detail = await fetchSstatsGameDetail({
        id: match.externalId,
        apiKey: input.apiKey,
        fetchImpl: input.fetchImpl,
      });
      requestsUsed += detail.requestsUsed;
      enriched.push({ ...match, stats: detail.stats });
    } catch {
      // Если детали недоступны, оставляем матч без статистики — синк не ломаем.
      enriched.push(match);
    }
  }

  return { matches: enriched, requestsUsed };
}
