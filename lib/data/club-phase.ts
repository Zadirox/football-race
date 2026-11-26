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
  { slug: 'barcelona', nameRu: 'Барселона', country: 'Испания', leagueKey: 'laliga', inCardPool: true, sstatsAliases: ['Barcelona', 'FC Barcelona', 'Barça', 'Barca'] },
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
  { slug: 'lyon', nameRu: 'Лион', country: 'Франция', leagueKey: 'ligue-1', inCardPool: false, sstatsAliases: ['Lyon', 'Olympique Lyonnais', 'Olympique Lyon'] },
  { slug: 'monaco', nameRu: 'Монако', country: 'Франция', leagueKey: 'ligue-1', inCardPool: false, sstatsAliases: ['Monaco', 'AS Monaco'] },

  // Нидерланды (Eredivisie — дом. лига убрана в Y4, клубы остаются для еврокубков)
  { slug: 'psv', nameRu: 'ПСВ', country: 'Нидерланды', leagueKey: 'eredivisie', inCardPool: false, sstatsAliases: ['PSV Eindhoven', 'PSV'] },
  { slug: 'ajax', nameRu: 'Аякс', country: 'Нидерланды', leagueKey: 'eredivisie', inCardPool: false, sstatsAliases: ['Ajax', 'AFC Ajax'] },

  // Португалия (Primeira Liga — дом. лига убрана в Y4)

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

  // Словакия (Super Liga SK — убрана в Y4)

  // Украина (UPL — дом. лига убрана в Y4)

  // Азербайджан (Premyer Liqa — дом. лига убрана в Y4)
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

  // Conservative token-overlap fallback (avoids false positives on short/generic names).
  for (const [aliasNorm, club] of WHITELIST_ALIAS_INDEX.entries()) {
    if (aliasNorm.length < 6 || norm.length < 5) continue;
    if (norm === aliasNorm) return club;
    if (norm.includes(aliasNorm) || aliasNorm.includes(norm)) return club;
  }
  return null;
}

export function isWhitelistedClubMatch(homeName: string | null | undefined, awayName: string | null | undefined): boolean {
  return matchWhitelistClub(homeName) !== null || matchWhitelistClub(awayName) !== null;
}

/**
 * G1a (2026-11-22): domestic whitelist_only roster allowlist.
 * Used only when exactly one side is whitelisted in a domestic whitelist_only competition.
 * Seeded from observed legit 20-22.11 opponents + common top-flight teams; REVIEW NEEDED.
 * Fail-closed: unknown non-whitelisted opponent => reject.
 */
export const DOMESTIC_LEAGUE_ROSTER: Readonly<Record<string, readonly string[]>> = {
  PL: [
    'Fulham', 'Фулхэм', 'Everton', 'Эвертон', 'West Ham', 'West Ham United', 'Вест Хэм', 'Вест Хэм Юнайтед',
    'Crystal Palace', 'Кристал Пэлас', 'Wolverhampton', 'Wolves', 'Вулверхэмптон',
    'Nottingham Forest', "Nott'ham Forest", 'Ноттингем Форест', 'Brentford', 'Брентфорд',
    'Leeds United', 'Leeds', 'Лидс Юнайтед', 'Лидс', 'Burnley', 'Бернли', 'Sunderland', 'Сандерленд',
    'Ipswich', 'Ipswich Town', 'Ипсвич Таун', 'Ипсвич', 'Leicester', 'Leicester City', 'Лестер',
    'Southampton', 'Саутгемптон', 'Bournemouth', 'AFC Bournemouth', 'Борнмут',
  ],
  PD: [
    'Sevilla', 'Sevilla FC', 'Севилья', 'Getafe', 'Getafe CF', 'Хетафе', 'Valencia', 'Valencia CF', 'Валенсия',
    'Osasuna', 'CA Osasuna', 'Осасуна', 'Rayo Vallecano', 'Райо Вальекано', 'Mallorca', 'RCD Mallorca', 'Мальорка',
    'Girona', 'Girona FC', 'Жирона', 'Alaves', 'Deportivo Alaves', 'Алавес',
    'Las Palmas', 'UD Las Palmas', 'Лас-Пальмас', 'Espanyol', 'RCD Espanyol', 'Эспаньол',
    'Real Valladolid', 'Valladolid', 'Вальядолид', 'Leganes', 'CD Leganes', 'Леганес',
  ],
  BL1: [
    'FC Koln', '1. FC Koln', 'Koln', 'Cologne', '1. FC Cologne', 'Кёльн', 'Кельн',
    'Schalke 04', 'FC Schalke 04', 'Шальке 04', 'Шальке',
    'Eintracht Frankfurt', 'Frankfurt', 'Айнтрахт Франкфурт', 'Айнтрахт',
    'Bayer Leverkusen', 'Leverkusen', 'Байер Леверкузен', 'Байер',
    'VfL Wolfsburg', 'Wolfsburg', 'Вольфсбург',
    'SC Freiburg', 'Freiburg', 'Фрайбург',
    'Borussia Monchengladbach', "Borussia M'gladbach", 'Monchengladbach', 'Gladbach', 'Боруссия Мёнхенгладбах', 'Боруссия Менхенгладбах',
    '1. FSV Mainz 05', 'Mainz', 'Mainz 05', 'Майнц',
    'FC Augsburg', 'Augsburg', 'Аугсбург',
    'Werder Bremen', 'Bremen', 'Вердер', 'Вердер Бремен',
    'TSG Hoffenheim', 'Hoffenheim', 'Хоффенхайм',
    'Union Berlin', '1. FC Union Berlin', 'Унион Берлин',
    'FC St. Pauli', 'St Pauli', 'Санкт-Паули',
    'Holstein Kiel', 'Kiel', 'Хольштайн Киль',
    'VfL Bochum', 'Bochum', 'Бохум',
    '1. FC Heidenheim', 'Heidenheim', 'Хайденхайм',
  ],
  SA: [
    'Atalanta', 'Atalanta BC', 'Аталанта', 'Torino', 'Torino FC', 'Торино', 'Parma', 'Parma Calcio 1913', 'Парма',
    'Udinese', 'Udinese Calcio', 'Удинезе', 'Bologna', 'Bologna FC', 'Болонья',
    'Fiorentina', 'ACF Fiorentina', 'Фиорентина', 'Lazio', 'SS Lazio', 'Лацио',
    'Genoa', 'Genoa CFC', 'Дженоа', 'Cagliari', 'Cagliari Calcio', 'Кальяри',
    'Empoli', 'Empoli FC', 'Эмполи', 'Verona', 'Hellas Verona', 'Верона',
    'Lecce', 'US Lecce', 'Лечче', 'Monza', 'AC Monza', 'Монца',
  ],
  FL1: [
    'Auxerre', 'AJ Auxerre', 'Осер', 'Toulouse', 'Toulouse FC', 'Тулуза',
    'Marseille', 'Olympique Marseille', 'OM', 'Марсель',
    'Nice', 'OGC Nice', 'Ницца', 'Strasbourg', 'RC Strasbourg', 'Strasbourg Alsace', 'Страсбур',
    'Rennes', 'Stade Rennais', 'Ренн', 'Reims', 'Stade de Reims', 'Реймс',
    'Brest', 'Stade Brestois', 'Brestois', 'Брест', 'Nantes', 'FC Nantes', 'Нант',
    'Montpellier', 'Montpellier HSC', 'Монпелье', 'Le Havre', 'Le Havre AC', 'Гавр',
    'Saint-Etienne', 'AS Saint-Etienne', 'Сент-Этьен', 'Angers', 'Angers SCO', 'Анже',
  ],
  SLTR: [
    'Besiktas', 'Besiktas JK', 'Бешикташ', 'Trabzonspor', 'Трабзонспор',
    'Basaksehir', 'Istanbul Basaksehir', 'Башакшехир', 'Истанбул Башакшехир',
    'Kasimpasa', 'Kasimpasa SK', 'Касымпаша', 'Antalyaspor', 'Антальяспор',
    'Sivasspor', 'Сивасспор', 'Alanyaspor', 'Аланьяспор',
    'Samsunspor', 'Самсунспор', 'Kocaelispor', 'Коджаэлиспор',
  ],
};

function normalizeRosterName(value: string): string {
  return normalizeClubTeamName(value);
}

const DOMESTIC_ROSTER_INDEX: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const [leagueCode, names] of Object.entries(DOMESTIC_LEAGUE_ROSTER)) {
    const set = new Set<string>();
    for (const n of names) {
      const k = normalizeRosterName(n);
      if (k) set.add(k);
    }
    map.set(leagueCode, set);
  }
  return map;
})();

export function isAllowedDomesticRosterOpponent(leagueCode: string, teamName: string | null | undefined): boolean {
  if (!teamName) return false;
  const set = DOMESTIC_ROSTER_INDEX.get(leagueCode);
  if (!set) return false;
  const norm = normalizeRosterName(teamName);
  if (!norm) return false;
  if (set.has(norm)) return true;
  // conservative includes fallback, same spirit as whitelist matching
  for (const aliasNorm of set) {
    if (aliasNorm.length < 6 || norm.length < 5) continue;
    if (norm.includes(aliasNorm) || aliasNorm.includes(norm)) return true;
  }
  return false;
}

/**
 * G1 scope check for a match in a competition.
 * - scope=all: true
 * - euro cup whitelist_only (EL/ECL): OR (either team in whitelist)
 * - domestic whitelist_only: both whitelisted OR exactly one whitelisted and other in domestic roster
 */
export function isClubMatchAllowedForCompetition(
  homeName: string | null | undefined,
  awayName: string | null | undefined,
  leagueCode: string,
): boolean {
  const comp = CLUB_COMPETITION_BY_LEAGUE_CODE[leagueCode];
  if (!comp) return false;
  if (comp.scope === 'all') return true;
  const homeW = matchWhitelistClub(homeName) !== null;
  const awayW = matchWhitelistClub(awayName) !== null;
  if (homeW && awayW) return true;
  if (comp.kind === 'europe_cup') return homeW || awayW;
  // domestic whitelist_only G1
  if (homeW && !awayW) return isAllowedDomesticRosterOpponent(leagueCode, awayName);
  if (!homeW && awayW) return isAllowedDomesticRosterOpponent(leagueCode, homeName);
  return false;
}
