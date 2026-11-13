/**
 * Нормализация football-data.org v4 → наша модель `matches`.
 * Провайдер отдаёт лишнее, мы оставляем только то, что нужно игре.
 */

import { isAllowedMatch, leagueByProviderCode } from './leagues';
import { teamNameRu } from './team-names';

export type ProviderMatch = {
  id: number | string;
  utcDate: string;
  status: string;
  minute?: number | null;
  competition: { code?: string | null; name?: string | null; emblem?: string | null };
  homeTeam: { id?: number | null; name?: string | null; shortName?: string | null; crest?: string | null };
  awayTeam: { id?: number | null; name?: string | null; shortName?: string | null; crest?: string | null };
  score?: {
    fullTime?: { home: number | null; away: number | null };
    halfTime?: { home: number | null; away: number | null };
  } | null;
};

export type NormalizedMatch = {
  provider: 'football-data' | 'sstats';
  externalId: string;
  leagueCode: string;
  leagueTitle: string;
  homeName: string;
  homeLogo: string | null;
  awayName: string;
  awayLogo: string | null;
  kickoffUtc: Date;
  status: 'NS' | 'LIVE' | 'HT' | 'FT' | 'PST' | 'CANC' | 'ABD';
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
  htHomeScore: number | null;
  htAwayScore: number | null;
  raw: unknown;
};

const STATUS_MAP: Record<string, NormalizedMatch['status']> = {
  SCHEDULED: 'NS',
  TIMED: 'NS',
  IN_PLAY: 'LIVE',
  LIVE: 'LIVE',
  PAUSED: 'HT',
  FINISHED: 'FT',
  AWARDED: 'FT',
  POSTPONED: 'PST',
  CANCELLED: 'CANC',
  SUSPENDED: 'ABD',
  ABANDONED: 'ABD',
};

export function mapStatus(providerStatus: string): NormalizedMatch['status'] {
  return STATUS_MAP[providerStatus.toUpperCase()] ?? 'NS';
}

function cleanName(name: string | null | undefined, fallback: string): string {
  const value = (name ?? '').trim();
  return value.length > 0 ? value : fallback;
}

/** Убираем суффиксы «FC», «CF» из короткого имени — так аккуратнее в карточке. */
export function displayTeamName(raw: { name?: string | null; shortName?: string | null }, fallback: string): string {
  const short = (raw.shortName ?? '').trim();
  if (short.length > 0) return teamNameRu(short);
  const base = cleanName(raw.name, fallback).replace(/\s+(FC|CF|AFC|SC)$/i, '');
  return teamNameRu(base);
}

function originalTeamName(raw: { name?: string | null; shortName?: string | null }, fallback: string): string {
  const short = (raw.shortName ?? '').trim();
  if (short.length > 0) return short;
  return cleanName(raw.name, fallback).replace(/\s+(FC|CF|AFC|SC)$/i, '');
}

export function normalizeMatch(raw: ProviderMatch): NormalizedMatch | null {
  const competitionCode = (raw.competition?.code ?? '').toUpperCase();
  const league = leagueByProviderCode(competitionCode);
  if (!league) return null;

  const homeOriginal = originalTeamName(raw.homeTeam, 'Хозяева');
  const awayOriginal = originalTeamName(raw.awayTeam, 'Гости');
  const homeName = teamNameRu(homeOriginal);
  const awayName = teamNameRu(awayOriginal);

  // Фильтр товарищеских проверяем по исходным именам (список топ-сборных на английском).
  if (!isAllowedMatch({ competitionCode, homeName: homeOriginal, awayName: awayOriginal })) return null;

  const kickoff = new Date(raw.utcDate);
  if (Number.isNaN(kickoff.getTime())) return null;

  const fullTime = raw.score?.fullTime ?? null;
  const halfTime = raw.score?.halfTime ?? null;

  return {
    provider: 'football-data',
    externalId: String(raw.id),
    leagueCode: league.code,
    leagueTitle: league.title,
    homeName,
    homeLogo: raw.homeTeam.crest ?? null,
    awayName,
    awayLogo: raw.awayTeam.crest ?? null,
    kickoffUtc: kickoff,
    status: mapStatus(raw.status),
    minute: raw.minute ?? null,
    homeScore: fullTime?.home ?? null,
    awayScore: fullTime?.away ?? null,
    htHomeScore: halfTime?.home ?? null,
    htAwayScore: halfTime?.away ?? null,
    raw,
  };
}

export function normalizeMatches(raws: readonly ProviderMatch[]): NormalizedMatch[] {
  return raws
    .map(normalizeMatch)
    .filter((m): m is NormalizedMatch => m !== null)
    .sort((a, b) => a.kickoffUtc.getTime() - b.kickoffUtc.getTime());
}

/** Фильтр по окну игрового дня. */
export function matchesInWindow(
  matches: readonly NormalizedMatch[],
  opensAt: Date,
  closesAt: Date,
): NormalizedMatch[] {
  return matches.filter((m) => m.kickoffUtc >= opensAt && m.kickoffUtc <= closesAt);
}

/** Финальные статусы: матч больше не изменится. */
export function isFinalStatus(status: NormalizedMatch['status']): boolean {
  return status === 'FT' || status === 'PST' || status === 'CANC' || status === 'ABD';
}

/**
 * Выбор 4–5 матчей дня: сначала «интересные» лиги, потом остальные,
 * минимум один матч из топ-5 лиг, если он есть.
 */
export function pickDayMatches(matches: readonly NormalizedMatch[], limit = 5): NormalizedMatch[] {
  const priority = ['CL', 'PL', 'PD', 'SA', 'BL1', 'FL1', 'UNL', 'EC', 'WC', 'FR'];
  const sorted = [...matches].sort((a, b) => {
    const pa = priority.indexOf(a.leagueCode);
    const pb = priority.indexOf(b.leagueCode);
    if (pa !== pb) return pa - pb;
    return a.kickoffUtc.getTime() - b.kickoffUtc.getTime();
  });
  return sorted.slice(0, limit);
}
