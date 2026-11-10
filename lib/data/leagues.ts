/**
 * Разрешённые турниры и маппинг кодов провайдера.
 * РПЛ и ноунейм-дивизионы в игру не попадают — только топ.
 */

export type League = {
  code: string;
  title: string;
  /** Короткое имя для бейджа. */
  short: string;
  /** Коды football-data.org, которые считаем этим турниром. */
  providerCodes: readonly string[];
  /** Международный турнир — сборные. */
  national: boolean;
};

export const LEAGUES: readonly League[] = [
  { code: 'PL', title: 'Английская Премьер-лига', short: 'АПЛ', providerCodes: ['PL'], national: false },
  { code: 'PD', title: 'Ла Лига', short: 'Ла Лига', providerCodes: ['PD'], national: false },
  { code: 'SA', title: 'Серия А', short: 'Серия А', providerCodes: ['SA'], national: false },
  { code: 'BL1', title: 'Бундеслига', short: 'Бундеслига', providerCodes: ['BL1'], national: false },
  { code: 'FL1', title: 'Лига 1', short: 'Лига 1', providerCodes: ['FL1'], national: false },
  { code: 'CL', title: 'Лига чемпионов', short: 'ЛЧ', providerCodes: ['CL'], national: false },
  { code: 'UNL', title: 'Лига наций', short: 'Лига наций', providerCodes: ['UNL'], national: true },
  { code: 'EC', title: 'Чемпионат Европы', short: 'Евро', providerCodes: ['EC'], national: true },
  { code: 'WC', title: 'Чемпионат мира', short: 'ЧМ', providerCodes: ['WC'], national: true },
  { code: 'FR', title: 'Товарищеские матчи топ-сборных', short: 'Товарищеские', providerCodes: ['FR'], national: true },
] as const;

const BY_PROVIDER_CODE = new Map<string, League>();
for (const league of LEAGUES) {
  for (const code of league.providerCodes) BY_PROVIDER_CODE.set(code, league);
}

export function leagueByProviderCode(code: string): League | null {
  return BY_PROVIDER_CODE.get(code.toUpperCase()) ?? null;
}

export function leagueByCode(code: string): League | null {
  return LEAGUES.find((l) => l.code === code) ?? null;
}

/**
 * Товарищеские — только топ-сборные. Список короткий и правится вручную:
 * провайдер отдаёт десятки бессмысленных матчей, они игре не нужны.
 */
export const TOP_NATIONAL_TEAMS: readonly string[] = [
  'Argentina', 'Brazil', 'France', 'England', 'Spain', 'Germany', 'Italy',
  'Portugal', 'Netherlands', 'Belgium', 'Croatia', 'Uruguay', 'Denmark',
  'Switzerland', 'Morocco', 'Japan', 'Mexico', 'USA', 'Colombia', 'Poland',
  'Serbia', 'Turkey', 'Austria', 'Sweden', 'Norway', 'Senegal', 'Egypt',
  'South Korea', 'Australia', 'Ukraine', 'Czech Republic', 'Hungary',
  'Scotland', 'Wales', 'Republic of Ireland', 'Greece', 'Romania',
] as const;

export function isTopNationalTeam(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return TOP_NATIONAL_TEAMS.some((team) => team.toLowerCase() === normalized);
}

/** Матч проходит в разрешённом турнире (и проходит фильтр товарищеских). */
export function isAllowedMatch(input: {
  competitionCode: string;
  homeName: string;
  awayName: string;
}): boolean {
  const league = leagueByProviderCode(input.competitionCode);
  if (!league) return false;
  if (league.code === 'FR') {
    return isTopNationalTeam(input.homeName) || isTopNationalTeam(input.awayName);
  }
  return true;
}
