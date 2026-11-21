export type ClubCompetitionScope = 'all' | 'whitelist_only';
export type ClubCompetitionKind = 'europe_cup' | 'domestic_league';

export type ClubCompetition = {
  key: string;
  title: string;
  short: string;
  kind: ClubCompetitionKind;
  sstatsLeagueId: number;
  year: number;
  scope: ClubCompetitionScope;
  /** Canonical league_code stored on matches (Stage 3, 3.2=A). */
  leagueCode: string;
};

export type ClubWhitelistEntry = {
  slug: string;
  nameRu: string;
  country: string;
  /** Домашняя лига из исходного конфигуратора (может отсутствовать в CLUB_COMPETITIONS при Y4). */
  leagueKey: string;
  /** Входит в пул из 24 клубов для карточек. */
  inCardPool: boolean;
  /** Алиасы имён команды в ответах sstats/провайдеров (для матчинга). */
  sstatsAliases: string[];
};

/**
 * Stage 3 (Y4, подтверждено): евро-кубки + топ-5 + Süper Lig TR.
 * Дом. лиги Eredivisie/Primeira/Eliteserien/BE/AT/GR/CZ/SK/UA/AZ убраны из sync comps;
 * их клубы остаются в whitelist для UEL/UECL (whitelist-only), UCL — все матчи.
 */
export const CLUB_COMPETITIONS: readonly ClubCompetition[] = [
  { key: 'ucl', title: 'Лига чемпионов УЕФА', short: 'ЛЧ', kind: 'europe_cup', sstatsLeagueId: 2, year: 2026, scope: 'all', leagueCode: 'CL' },
  { key: 'uel', title: 'Лига Европы УЕФА', short: 'ЛЕ', kind: 'europe_cup', sstatsLeagueId: 3, year: 2026, scope: 'whitelist_only', leagueCode: 'EL' },
  { key: 'uecl', title: 'Лига конференций УЕФА', short: 'ЛК', kind: 'europe_cup', sstatsLeagueId: 848, year: 2026, scope: 'whitelist_only', leagueCode: 'ECL' },

  { key: 'pl', title: 'Английская Премьер-лига', short: 'АПЛ', kind: 'domestic_league', sstatsLeagueId: 39, year: 2026, scope: 'whitelist_only', leagueCode: 'PL' },
  { key: 'laliga', title: 'Ла Лига', short: 'Ла Лига', kind: 'domestic_league', sstatsLeagueId: 140, year: 2026, scope: 'whitelist_only', leagueCode: 'PD' },
  { key: 'bundesliga', title: 'Бундеслига', short: 'Бундеслига', kind: 'domestic_league', sstatsLeagueId: 78, year: 2026, scope: 'whitelist_only', leagueCode: 'BL1' },
  { key: 'serie-a', title: 'Серия А', short: 'Серия А', kind: 'domestic_league', sstatsLeagueId: 135, year: 2026, scope: 'whitelist_only', leagueCode: 'SA' },
  { key: 'ligue-1', title: 'Лига 1', short: 'Лига 1', kind: 'domestic_league', sstatsLeagueId: 61, year: 2026, scope: 'whitelist_only', leagueCode: 'FL1' },
  { key: 'super-lig-tr', title: 'Суперлига Турция', short: 'Турция', kind: 'domestic_league', sstatsLeagueId: 203, year: 2026, scope: 'whitelist_only', leagueCode: 'SLTR' },
] as const;

export const CLUB_WHITELIST: readonly ClubWhitelistEntry[] = [
  // Англия (PL)
  { slug: 'arsenal', nameRu: 'Арсенал', country: 'Англия', leagueKey: 'pl', inCardPool: true, sstatsAliases: ['Arsenal'] },
  { slug: 'aston-villa', nameRu: 'Астон Вилла', country: 'Англия', leagueKey: 'pl', inCardPool: true, sstatsAliases: ['Aston Villa'] },
  { slug: 'liverpool', nameRu: 'Ливерпуль', country: 'Англия', leagueKey: 'pl', inCardPool: true, sstatsAliases: ['Liverpool'] },
  { slug: 'manchester-city', nameRu: 'Манчестер Сити', country: 'Англия', leagueKey: 'pl', inCardPool: true, sstatsAliases: ['Manchester City', 'Man City'] },
  { slug: 'manchester-united', nameRu: 'Манчестер Юнайтед', country: 'Англия', leagueKey: 'pl', inCardPool: true, sstatsAliases: ['Manchester United', 'Man Utd', 'Manchester Utd', 'Man United'] },
  { slug: 'chelsea', nameRu: 'Челси', country: 'Англия', leagueKey: 'pl', inCardPool: true, sstatsAliases: ['Chelsea'] },
  { slug: 'tottenham', nameRu: 'Тоттенхэм', country: 'Англия', leagueKey: 'pl', inCardPool: true, sstatsAliases: ['Tottenham', 'Tottenham Hotspur'] },
  { slug: 'newcastle-united', nameRu: 'Ньюкасл', country: 'Англия', leagueKey: 'pl', inCardPool: false, sstatsAliases: ['Newcastle', 'Newcastle United'] },
  { slug: 'brighton', nameRu: 'Брайтон', country: 'Англия', leagueKey: 'pl', inCardPool: true, sstatsAliases: ['Brighton', 'Brighton & Hove Albion'] },
  { slug: 'bournemouth', nameRu: 'Борнмут', country: 'Англия', leagueKey: 'pl', inCardPool: false, sstatsAliases: ['Bournemouth', 'AFC Bournemouth'] },

  // Испания (La Liga)
  { slug: 'atletico-madrid', nameRu: 'Атлетико Мадрид', country: 'Испания', leagueKey: 'laliga', inCardPool: true, sstatsAliases: ['Atletico Madrid', 'Atlético Madrid', 'Atlético de Madrid'] },
  { slug: 'barcelona', nameRu: 'Барселона', country: 'Испания', leagueKey: 'laliga', inCardPool: true, sstatsAliases: ['Barcelona', 'FC Barcelona'] },
  { slug: 'real-betis', nameRu: 'Бетис', country: 'Испания', leagueKey: 'laliga', inCardPool: false, sstatsAliases: ['Real Betis'] },
  { slug: 'real-madrid', nameRu: 'Реал Мадрид', country: 'Испания', leagueKey: 'laliga', inCardPool: true, sstatsAliases: ['Real Madrid'] },
  { slug: 'villarreal', nameRu: 'Вильярреал', country: 'Испания', leagueKey: 'laliga', inCardPool: false, sstatsAliases: ['Villarreal', 'Villarreal CF'] },
  { slug: 'athletic-bilbao', nameRu: 'Атлетик Бильбао', country: 'Испания', leagueKey: 'laliga', inCardPool: false, sstatsAliases: ['Athletic Club', 'Athletic Bilbao'] },
  { slug: 'real-sociedad', nameRu: 'Реал Сосьедад', country: 'Испания', leagueKey: 'laliga', inCardPool: false, sstatsAliases: ['Real Sociedad'] },
  { slug: 'celta-vigo', nameRu: 'Сельта', country: 'Испания', leagueKey: 'laliga', inCardPool: false, sstatsAliases: ['Celta Vigo', 'RC Celta', 'Celta de Vigo', 'RC Celta de Vigo'] },

  // Германия (Bundesliga)
  { slug: 'bayern-munich', nameRu: 'Бавария', country: 'Германия', leagueKey: 'bundesliga', inCardPool: true, sstatsAliases: ['Bayern München', 'Bayern Munich', 'FC Bayern München', 'FC Bayern Munich'] },
  { slug: 'borussia-dortmund', nameRu: 'Боруссия Дортмунд', country: 'Германия', leagueKey: 'bundesliga', inCardPool: true, sstatsAliases: ['Borussia Dortmund'] },
  { slug: 'rb-leipzig', nameRu: 'РБ Лейпциг', country: 'Германия', leagueKey: 'bundesliga', inCardPool: true, sstatsAliases: ['RB Leipzig', 'RasenBallsport Leipzig'] },
  { slug: 'stuttgart', nameRu: 'Штутгарт', country: 'Германия', leagueKey: 'bundesliga', inCardPool: false, sstatsAliases: ['VfB Stuttgart', 'Stuttgart'] },
  { slug: 'bayer-leverkusen', nameRu: 'Байер Леверкузен', country: 'Германия', leagueKey: 'bundesliga', inCardPool: false, sstatsAliases: ['Bayer Leverkusen', 'Bayer 04 Leverkusen'] },
  { slug: 'hoffenheim', nameRu: 'Хоффенхайм', country: 'Германия', leagueKey: 'bundesliga', inCardPool: false, sstatsAliases: ['1899 Hoffenheim', 'TSG Hoffenheim', 'Hoffenheim', 'TSG 1899 Hoffenheim'] },

  // Италия (Serie A)
  { slug: 'inter', nameRu: 'Интер', country: 'Италия', leagueKey: 'serie-a', inCardPool: true, sstatsAliases: ['Inter', 'Inter Milan', 'Internazionale', 'FC Internazionale Milano'] },
  { slug: 'como', nameRu: 'Комо', country: 'Италия', leagueKey: 'serie-a', inCardPool: true, sstatsAliases: ['Como', 'Como 1907'] },
  { slug: 'napoli', nameRu: 'Наполи', country: 'Италия', leagueKey: 'serie-a', inCardPool: true, sstatsAliases: ['Napoli', 'SSC Napoli'] },
  { slug: 'roma', nameRu: 'Рома', country: 'Италия', leagueKey: 'serie-a', inCardPool: true, sstatsAliases: ['AS Roma', 'Roma'] },
  { slug: 'ac-milan', nameRu: 'Милан', country: 'Италия', leagueKey: 'serie-a', inCardPool: true, sstatsAliases: ['AC Milan', 'Milan'] },
  { slug: 'juventus', nameRu: 'Ювентус', country: 'Италия', leagueKey: 'serie-a', inCardPool: true, sstatsAliases: ['Juventus'] },

  // Франция (Ligue 1)
  { slug: 'psg', nameRu: 'ПСЖ', country: 'Франция', leagueKey: 'ligue-1', inCardPool: true, sstatsAliases: ['Paris Saint Germain', 'Paris Saint-Germain', 'PSG', 'Paris SG'] },
  { slug: 'lens', nameRu: 'Ланс', country: 'Франция', leagueKey: 'ligue-1', inCardPool: false, sstatsAliases: ['Lens', 'RC Lens'] },
  { slug: 'lille', nameRu: 'Лилль', country: 'Франция', leagueKey: 'ligue-1', inCardPool: true, sstatsAliases: ['Lille', 'LOSC Lille', 'LOSC'] },
  { slug: 'marseille', nameRu: 'Марсель', country: 'Франция', leagueKey: 'ligue-1', inCardPool: false, sstatsAliases: ['Marseille', 'Olympique de Marseille', 'Olympique Marseille', 'OM'] },
  { slug: 'lyon', nameRu: 'Лион', country: 'Франция', leagueKey: 'ligue-1', inCardPool: false, sstatsAliases: ['Lyon', 'Olympique Lyonnais', 'Olympique Lyon'] },
  { slug: 'monaco', nameRu: 'Монако', country: 'Франция', leagueKey: 'ligue-1', inCardPool: false, sstatsAliases: ['Monaco', 'AS Monaco'] },
  { slug: 'rennes', nameRu: 'Ренн', country: 'Франция', leagueKey: 'ligue-1', inCardPool: false, sstatsAliases: ['Rennes', 'Stade Rennais', 'Stade Rennais FC'] },

  // Нидерланды (Eredivisie — дом. лига убрана в Y4, клубы остаются для еврокубков)
  { slug: 'psv', nameRu: 'ПСВ', country: 'Нидерланды', leagueKey: 'eredivisie', inCardPool: false, sstatsAliases: ['PSV Eindhoven', 'PSV'] },
  { slug: 'feyenoord', nameRu: 'Фейеноорд', country: 'Нидерланды', leagueKey: 'eredivisie', inCardPool: false, sstatsAliases: ['Feyenoord'] },
  { slug: 'ajax', nameRu: 'Аякс', country: 'Нидерланды', leagueKey: 'eredivisie', inCardPool: false, sstatsAliases: ['Ajax', 'AFC Ajax'] },

  // Португалия (Primeira Liga — дом. лига убрана в Y4)
  { slug: 'porto', nameRu: 'Порту', country: 'Португалия', leagueKey: 'primeira-liga', inCardPool: false, sstatsAliases: ['FC Porto', 'Porto'] },
  { slug: 'sporting-cp', nameRu: 'Спортинг', country: 'Португалия', leagueKey: 'primeira-liga', inCardPool: false, sstatsAliases: ['Sporting CP', 'Sporting Lisbon', 'Sporting', 'Sporting Clube de Portugal'] },
  { slug: 'benfica', nameRu: 'Бенфика', country: 'Португалия', leagueKey: 'primeira-liga', inCardPool: false, sstatsAliases: ['Benfica', 'SL Benfica', 'Sport Lisboa e Benfica'] },

  // Турция (Süper Lig)
  { slug: 'galatasaray', nameRu: 'Галатасарай', country: 'Турция', leagueKey: 'super-lig-tr', inCardPool: true, sstatsAliases: ['Galatasaray'] },
  { slug: 'fenerbahce', nameRu: 'Фенербахче', country: 'Турция', leagueKey: 'super-lig-tr', inCardPool: true, sstatsAliases: ['Fenerbahçe', 'Fenerbahce'] },

  // Норвегия (Eliteserien — дом. лига убрана в Y4)
  { slug: 'bodo-glimt', nameRu: 'Будё-Глимт', country: 'Норвегия', leagueKey: 'eliteserien', inCardPool: false, sstatsAliases: ['Bodo/Glimt', 'Bodø/Glimt', 'FK Bodø/Glimt', 'Bodo Glimt'] },
  { slug: 'viking', nameRu: 'Викинг', country: 'Норвегия', leagueKey: 'eliteserien', inCardPool: false, sstatsAliases: ['Viking', 'Viking FK'] },

  // Бельгия (Jupiler Pro League — убрана в Y4)
  { slug: 'club-brugge', nameRu: 'Брюгге', country: 'Бельгия', leagueKey: 'jupiler-pro-league', inCardPool: false, sstatsAliases: ['Club Brugge KV', 'Club Brugge'] },

  // Австрия (Bundesliga AT — убрана в Y4)
  { slug: 'lask', nameRu: 'ЛАСК', country: 'Австрия', leagueKey: 'bundesliga-at', inCardPool: false, sstatsAliases: ['Lask Linz', 'LASK', 'LASK Linz'] },

  // Греция (Super League 1 — убрана в Y4)
  { slug: 'aek-athens', nameRu: 'АЕК Афины', country: 'Греция', leagueKey: 'super-league-gr', inCardPool: false, sstatsAliases: ['AEK Athens FC', 'AEK Athens', 'AEK'] },

  // Чехия (Czech Liga — убрана в Y4)
  { slug: 'slavia-prague', nameRu: 'Славия Прага', country: 'Чехия', leagueKey: 'czech-liga', inCardPool: false, sstatsAliases: ['Slavia Praha', 'Slavia Prague', 'SK Slavia Praha', 'SK Slavia Prague'] },

  // Словакия (Super Liga SK — убрана в Y4)
  { slug: 'slovan-bratislava', nameRu: 'Слован Братислава', country: 'Словакия', leagueKey: 'super-liga-sk', inCardPool: false, sstatsAliases: ['Slovan Bratislava', 'ŠK Slovan Bratislava'] },

  // Украина (UPL — дом. лига убрана в Y4)
  { slug: 'shakhtar-donetsk', nameRu: 'Шахтёр Донецк', country: 'Украина', leagueKey: 'upl', inCardPool: false, sstatsAliases: ['Shakhtar Donetsk', 'Shakhtar', 'FC Shakhtar Donetsk'] },

  // Азербайджан (Premyer Liqa — дом. лига убрана в Y4)
  { slug: 'sabah', nameRu: 'Сабах', country: 'Азербайджан', leagueKey: 'premyer-liqa-az', inCardPool: false, sstatsAliases: ['Sabah FA', 'Sabah', 'Sabah FK', 'Sabah Baku', 'Sabah Masazir'] },
] as const;

export const CLUB_LEAGUE_CODE_BY_KEY: Readonly<Record<string, string>> = Object.fromEntries(
  CLUB_COMPETITIONS.map((c) => [c.key, c.leagueCode]),
);

export const CLUB_COMPETITION_BY_LEAGUE_CODE: Readonly<Record<string, ClubCompetition>> = Object.fromEntries(
  CLUB_COMPETITIONS.map((c) => [c.leagueCode, c]),
);

export const CLUB_SSTATS_LEAGUE_IDS: ReadonlySet<number> = new Set(
  CLUB_COMPETITIONS.map((c) => c.sstatsLeagueId),
);

export function normalizeClubTeamName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WHITELIST_ALIAS_INDEX: ReadonlyMap<string, ClubWhitelistEntry> = (() => {
  const map = new Map<string, ClubWhitelistEntry>();
  for (const club of CLUB_WHITELIST) {
    const names = [club.slug.replace(/-/g, ' '), club.nameRu, ...club.sstatsAliases];
    for (const name of names) {
      const key = normalizeClubTeamName(name);
      if (!key) continue;
      if (!map.has(key)) map.set(key, club);
    }
  }
  return map;
})();

/** Returns whitelist club if team name matches any known alias/slug/name (normalized). */
export function matchWhitelistClub(teamName: string | null | undefined): ClubWhitelistEntry | null {
  if (!teamName) return null;
  const norm = normalizeClubTeamName(teamName);
  if (!norm) return null;
  const direct = WHITELIST_ALIAS_INDEX.get(norm);
  if (direct) return direct;

  // Conservative token-overlap fallback (avoids false positives on short names).
  for (const [aliasNorm, club] of WHITELIST_ALIAS_INDEX.entries()) {
    if (aliasNorm.length < 5 || norm.length < 5) continue;
    if (norm === aliasNorm) return club;
    if (norm.includes(aliasNorm) || aliasNorm.includes(norm)) return club;
  }
  return null;
}

export function isWhitelistedClubMatch(homeName: string | null | undefined, awayName: string | null | undefined): boolean {
  return matchWhitelistClub(homeName) !== null && matchWhitelistClub(awayName) !== null;
}
