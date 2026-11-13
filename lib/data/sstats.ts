/**
 * Клиент sstats.net — источник матчей и счёта там, где основной провайдер
 * не отдаёт нужный турнир (например Лига наций).
 *
 * Используем публичные эндпоинты; ключ, если задан, передаётся в заголовках
 * (рекомендация sstats), но без него запросы тоже могут работать.
 */

import { AppError } from '@/lib/errors';
import type { NormalizedMatch } from './normalize';

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

function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
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

function cleanName(name: string | null | undefined, fallback: string): string {
  const value = (name ?? '').trim();
  return value.length > 0 ? value : fallback;
}

export function normalizeSstatsUnlGame(game: SstatsGame): NormalizedMatch | null {
  const kickoffUtc = parseUtc(game.dateUtc ?? game.date ?? null);
  if (!kickoffUtc) return null;

  const homeName = cleanName(game.homeTeam?.shortName ?? game.homeTeam?.name, 'Хозяева');
  const awayName = cleanName(game.awayTeam?.shortName ?? game.awayTeam?.name, 'Гости');
  if (!homeName || !awayName) return null;

  const status = mapSstatsStatus(game.statusName ?? game.status);
  const homeScore = typeof game.homeResult === 'number' ? game.homeResult : null;
  const awayScore = typeof game.awayResult === 'number' ? game.awayResult : null;
  const htHomeScore = typeof game.htResult?.home === 'number' ? game.htResult.home : null;
  const htAwayScore = typeof game.htResult?.away === 'number' ? game.htResult.away : null;

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
