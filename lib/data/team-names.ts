/**
 * Отображение названий команд в интерфейсе.
 *
 * Источники отдают имена по-разному (часто по-английски). Здесь — словарь
 * переводов и коротких обозначений, чтобы в игре показывать понятные русские
 * названия и компактные подписи в карточках матчей.
 */

export type TeamDisplay = {
  name: string;
  short: string;
};

type Entry = { ru: string; short: string; aliases?: string[] };

const ENTRIES: Entry[] = [
  // Сборные (часто встречаются в Лиге наций, Евро, ЧМ, товарищеских)
  { ru: 'Австралия', short: 'АВС', aliases: ['Australia'] },
  { ru: 'Австрия', short: 'АВТ', aliases: ['Austria'] },
  { ru: 'Азербайджан', short: 'АЗЕ', aliases: ['Azerbaijan'] },
  { ru: 'Албания', short: 'АЛБ', aliases: ['Albania'] },
  { ru: 'Англия', short: 'АНГ', aliases: ['England'] },
  { ru: 'Андорра', short: 'АНД', aliases: ['Andorra'] },
  { ru: 'Аргентина', short: 'АРГ', aliases: ['Argentina'] },
  { ru: 'Армения', short: 'АРМ', aliases: ['Armenia'] },
  { ru: 'Беларусь', short: 'БЕЛ', aliases: ['Belarus'] },
  { ru: 'Бельгия', short: 'БЕЛ', aliases: ['Belgium'] },
  { ru: 'Болгария', short: 'БОЛ', aliases: ['Bulgaria'] },
  { ru: 'Босния и Герцеговина', short: 'БОС', aliases: ['Bosnia and Herzegovina', 'Bosnia-Herzegovina', 'Bosnia & Herzegovina'] },
  { ru: 'Бразилия', short: 'БРА', aliases: ['Brazil'] },
  { ru: 'Венгрия', short: 'ВЕН', aliases: ['Hungary'] },
  { ru: 'Германия', short: 'ГЕР', aliases: ['Germany'] },
  { ru: 'Гибралтар', short: 'ГИБ', aliases: ['Gibraltar'] },
  { ru: 'Греция', short: 'ГРЕ', aliases: ['Greece'] },
  { ru: 'Грузия', short: 'ГРУ', aliases: ['Georgia'] },
  { ru: 'Дания', short: 'ДАН', aliases: ['Denmark'] },
  { ru: 'Египет', short: 'ЕГИ', aliases: ['Egypt'] },
  { ru: 'Израиль', short: 'ИЗР', aliases: ['Israel'] },
  { ru: 'Ирландия', short: 'ИРЛ', aliases: ['Republic of Ireland', 'Ireland', 'Rep. of Ireland', 'Rep. Of Ireland', 'Rep of Ireland', 'Republic Of Ireland', 'ROI'] },
  { ru: 'Исландия', short: 'ИСЛ', aliases: ['Iceland'] },
  { ru: 'Испания', short: 'ИСП', aliases: ['Spain'] },
  { ru: 'Италия', short: 'ИТА', aliases: ['Italy'] },
  { ru: 'Казахстан', short: 'КАЗ', aliases: ['Kazakhstan'] },
  { ru: 'Канада', short: 'КАН', aliases: ['Canada'] },
  { ru: 'Кипр', short: 'КИП', aliases: ['Cyprus'] },
  { ru: 'Колумбия', short: 'КОЛ', aliases: ['Colombia'] },
  { ru: 'Косово', short: 'КОС', aliases: ['Kosovo'] },
  { ru: 'Латвия', short: 'ЛАТ', aliases: ['Latvia'] },
  { ru: 'Литва', short: 'ЛИТ', aliases: ['Lithuania'] },
  { ru: 'Лихтенштейн', short: 'ЛИХ', aliases: ['Liechtenstein'] },
  { ru: 'Люксембург', short: 'ЛЮК', aliases: ['Luxembourg'] },
  { ru: 'Мальта', short: 'МАЛ', aliases: ['Malta'] },
  { ru: 'Марокко', short: 'МАР', aliases: ['Morocco'] },
  { ru: 'Мексика', short: 'МЕК', aliases: ['Mexico'] },
  { ru: 'Молдова', short: 'МОЛ', aliases: ['Moldova'] },
  { ru: 'Нидерланды', short: 'НИД', aliases: ['Netherlands', 'Holland', 'The Netherlands'] },
  { ru: 'Норвегия', short: 'НОР', aliases: ['Norway'] },
  { ru: 'Польша', short: 'ПОЛ', aliases: ['Poland'] },
  { ru: 'Португалия', short: 'ПОР', aliases: ['Portugal'] },
  { ru: 'Румыния', short: 'РУМ', aliases: ['Romania'] },
  { ru: 'Сан-Марино', short: 'САН', aliases: ['San Marino'] },
  { ru: 'Северная Ирландия', short: 'СИР', aliases: ['Northern Ireland'] },
  { ru: 'Македония', short: 'МАК', aliases: ['North Macedonia', 'Macedonia', 'FYR Macedonia'] },
  { ru: 'Сенегал', short: 'СЕН', aliases: ['Senegal'] },
  { ru: 'Сербия', short: 'СРБ', aliases: ['Serbia'] },
  { ru: 'Словакия', short: 'СЛО', aliases: ['Slovakia'] },
  { ru: 'Словения', short: 'СЛВ', aliases: ['Slovenia'] },
  { ru: 'США', short: 'США', aliases: ['USA', 'United States', 'United States of America'] },
  { ru: 'Турция', short: 'ТУР', aliases: ['Turkey', 'Türkiye', 'Turkiye'] },
  { ru: 'Украина', short: 'УКР', aliases: ['Ukraine'] },
  { ru: 'Уэльс', short: 'УЭЛ', aliases: ['Wales'] },
  { ru: 'Фарерские острова', short: 'ФАР', aliases: ['Faroe Islands', 'Faroes'] },
  { ru: 'Финляндия', short: 'ФИН', aliases: ['Finland'] },
  { ru: 'Франция', short: 'ФРА', aliases: ['France'] },
  { ru: 'Хорватия', short: 'ХОР', aliases: ['Croatia'] },
  { ru: 'Черногория', short: 'ЧЕР', aliases: ['Montenegro'] },
  { ru: 'Чехия', short: 'ЧЕХ', aliases: ['Czech Republic', 'Czechia'] },
  { ru: 'Чили', short: 'ЧИЛ', aliases: ['Chile'] },
  { ru: 'Швейцария', short: 'ШВЕ', aliases: ['Switzerland'] },
  { ru: 'Швеция', short: 'ШВЦ', aliases: ['Sweden'] },
  { ru: 'Шотландия', short: 'ШОТ', aliases: ['Scotland'] },
  { ru: 'Эстония', short: 'ЭСТ', aliases: ['Estonia'] },
  { ru: 'Южная Корея', short: 'КОР', aliases: ['South Korea', 'Korea Republic'] },
  { ru: 'Япония', short: 'ЯПО', aliases: ['Japan'] },
  { ru: 'Уругвай', short: 'УРУ', aliases: ['Uruguay'] },
  { ru: 'Эквадор', short: 'ЭКВ', aliases: ['Ecuador'] },
  { ru: 'Парагвай', short: 'ПАР', aliases: ['Paraguay'] },
  { ru: 'Перу', short: 'ПЕР', aliases: ['Peru'] },
  { ru: 'Иран', short: 'ИРА', aliases: ['Iran'] },
  { ru: 'Саудовская Аравия', short: 'САУ', aliases: ['Saudi Arabia'] },
  { ru: 'Катар', short: 'КАТ', aliases: ['Qatar'] },
  { ru: 'Нигерия', short: 'НИГ', aliases: ['Nigeria'] },
  { ru: 'Камерун', short: 'КАМ', aliases: ['Cameroon'] },
  { ru: 'Гана', short: 'ГАН', aliases: ['Ghana'] },
  { ru: 'Алжир', short: 'АЛЖ', aliases: ['Algeria'] },
  { ru: 'Тунис', short: 'ТУН', aliases: ['Tunisia'] },
  { ru: 'ЮАР', short: 'ЮАР', aliases: ['South Africa'] },
];

function norm(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[’'`]/g, "'");
}

const CLUB_ENTRIES: Entry[] = [
  // Клубы whitelist
  { ru: 'Арсенал', short: 'АРС', aliases: ['Arsenal'] },
  { ru: 'Астон Вилла', short: 'АВЛ', aliases: ['Aston Villa'] },
  { ru: 'Ливерпуль', short: 'ЛИВ', aliases: ['Liverpool'] },
  { ru: 'Манчестер Сити', short: 'МС', aliases: ['Manchester City', 'Man City'] },
  { ru: 'Манчестер Юнайтед', short: 'МЮ', aliases: ['Manchester United', 'Man Utd', 'Manchester Utd', 'Man United'] },
  { ru: 'Челси', short: 'ЧЕЛ', aliases: ['Chelsea'] },
  { ru: 'Тоттенхэм', short: 'ТОТ', aliases: ['Tottenham', 'Tottenham Hotspur'] },
  { ru: 'Ньюкасл', short: 'НЬЮ', aliases: ['Newcastle', 'Newcastle United'] },
  { ru: 'Брайтон', short: 'БРА', aliases: ['Brighton', 'Brighton & Hove Albion', 'Brighton Hove'] },
  { ru: 'Борнмут', short: 'БОР', aliases: ['Bournemouth', 'AFC Bournemouth'] },
  { ru: 'Атлетико Мадрид', short: 'АТМ', aliases: ['Atletico Madrid', 'Atlético Madrid', 'Atlético de Madrid', 'Atletico'] },
  { ru: 'Барселона', short: 'БАР', aliases: ['Barcelona', 'FC Barcelona'] },
  { ru: 'Реал Бетис', short: 'БЕТ', aliases: ['Real Betis', 'Betis'] },
  { ru: 'Реал Мадрид', short: 'РМА', aliases: ['Real Madrid'] },
  { ru: 'Вильярреал', short: 'ВИЛ', aliases: ['Villarreal', 'Villarreal CF'] },
  { ru: 'Атлетик Бильбао', short: 'АТБ', aliases: ['Athletic Club', 'Athletic Bilbao', 'Athletic'] },
  { ru: 'Реал Сосьедад', short: 'РСО', aliases: ['Real Sociedad'] },
  { ru: 'Сельта', short: 'СЕЛ', aliases: ['Celta Vigo', 'RC Celta', 'Celta de Vigo', 'RC Celta de Vigo', 'Celta'] },
  { ru: 'Бавария', short: 'БАВ', aliases: ['Bayern München', 'Bayern Munich', 'FC Bayern München', 'FC Bayern Munich', 'Bayern'] },
  { ru: 'Боруссия Дортмунд', short: 'БД', aliases: ['Borussia Dortmund', 'Dortmund', 'BVB'] },
  { ru: 'РБ Лейпциг', short: 'РБЛ', aliases: ['RB Leipzig', 'RasenBallsport Leipzig'] },
  { ru: 'Штутгарт', short: 'ШТУ', aliases: ['VfB Stuttgart', 'Stuttgart'] },
  { ru: 'Байер Леверкузен', short: 'БАЙ', aliases: ['Bayer Leverkusen', 'Bayer 04 Leverkusen', 'Leverkusen'] },
  { ru: 'Хоффенхайм', short: 'ХОФ', aliases: ['1899 Hoffenheim', 'TSG Hoffenheim', 'Hoffenheim', 'TSG 1899 Hoffenheim'] },
  { ru: 'Интер', short: 'ИНТ', aliases: ['Inter', 'Inter Milan', 'Internazionale', 'FC Internazionale Milano'] },
  { ru: 'Комо', short: 'КОМ', aliases: ['Como', 'Como 1907'] },
  { ru: 'Наполи', short: 'НАП', aliases: ['Napoli', 'SSC Napoli'] },
  { ru: 'Рома', short: 'РОМ', aliases: ['AS Roma', 'Roma'] },
  { ru: 'Милан', short: 'МИЛ', aliases: ['AC Milan', 'Milan'] },
  { ru: 'Ювентус', short: 'ЮВЕ', aliases: ['Juventus'] },
  { ru: 'ПСЖ', short: 'ПСЖ', aliases: ['Paris Saint Germain', 'Paris Saint-Germain', 'PSG', 'Paris SG'] },
  { ru: 'Ланс', short: 'ЛАН', aliases: ['Lens', 'RC Lens'] },
  { ru: 'Лилль', short: 'ЛИЛ', aliases: ['Lille', 'LOSC Lille', 'LOSC'] },
  { ru: 'Марсель', short: 'МАР', aliases: ['Marseille', 'Olympique de Marseille', 'Olympique Marseille', 'OM'] },
  { ru: 'Лион', short: 'ЛИО', aliases: ['Lyon', 'Olympique Lyonnais', 'Olympique Lyon'] },
  { ru: 'Монако', short: 'МОН', aliases: ['Monaco', 'AS Monaco'] },
  { ru: 'Ренн', short: 'РЕН', aliases: ['Rennes', 'Stade Rennais', 'Stade Rennais FC'] },
  { ru: 'ПСВ', short: 'ПСВ', aliases: ['PSV Eindhoven', 'PSV'] },
  { ru: 'Фейеноорд', short: 'ФЕЙ', aliases: ['Feyenoord'] },
  { ru: 'Аякс', short: 'АЯК', aliases: ['Ajax', 'AFC Ajax'] },
  { ru: 'Порту', short: 'ПОР', aliases: ['FC Porto', 'Porto'] },
  { ru: 'Спортинг', short: 'СПО', aliases: ['Sporting CP', 'Sporting Lisbon', 'Sporting', 'Sporting Clube de Portugal'] },
  { ru: 'Бенфика', short: 'БЕН', aliases: ['Benfica', 'SL Benfica', 'Sport Lisboa e Benfica'] },
  { ru: 'Галатасарай', short: 'ГАЛ', aliases: ['Galatasaray'] },
  { ru: 'Фенербахче', short: 'ФЕН', aliases: ['Fenerbahçe', 'Fenerbahce'] },
  { ru: 'Будё-Глимт', short: 'БУД', aliases: ['Bodo/Glimt', 'Bodø/Glimt', 'FK Bodø/Glimt', 'Bodo Glimt'] },
  { ru: 'Викинг', short: 'ВИК', aliases: ['Viking', 'Viking FK'] },
  { ru: 'Брюгге', short: 'БРЮ', aliases: ['Club Brugge KV', 'Club Brugge'] },
  { ru: 'ЛАСК', short: 'ЛАС', aliases: ['Lask Linz', 'LASK', 'LASK Linz'] },
  { ru: 'АЕК Афины', short: 'АЕК', aliases: ['AEK Athens FC', 'AEK Athens', 'AEK'] },
  { ru: 'Славия Прага', short: 'СЛП', aliases: ['Slavia Praha', 'Slavia Prague', 'SK Slavia Praha', 'SK Slavia Prague'] },
  { ru: 'Слован Братислава', short: 'СЛБ', aliases: ['Slovan Bratislava', 'ŠK Slovan Bratislava'] },
  { ru: 'Шахтёр Донецк', short: 'ШАХ', aliases: ['Shakhtar Donetsk', 'Shakhtar', 'FC Shakhtar Donetsk'] },
  { ru: 'Сабах', short: 'САБ', aliases: ['Sabah FA', 'Sabah', 'Sabah FK', 'Sabah Baku', 'Sabah Masazir'] },

  // Частые соперники (не в whitelist)
  { ru: 'Фулхэм', short: 'ФУЛ', aliases: ['Fulham'] },
  { ru: 'Кальяри', short: 'КАЛ', aliases: ['Cagliari'] },
  { ru: 'Боруссия Мёнхенгладбах', short: 'БМГ', aliases: ["M'gladbach", 'Borussia Mönchengladbach', 'Borussia Monchengladbach', 'Gladbach'] },
  { ru: 'Айнтрахт Франкфурт', short: 'АЙН', aliases: ['Eintracht Frankfurt', 'Frankfurt'] },
  { ru: 'Унион Берлин', short: 'УНИ', aliases: ['Union Berlin', '1. FC Union Berlin'] },
  { ru: 'Ипсвич Таун', short: 'ИПС', aliases: ['Ipswich Town', 'Ipswich'] },
  { ru: 'Сандерленд', short: 'САН', aliases: ['Sunderland'] },
  { ru: 'Лидс Юнайтед', short: 'ЛИД', aliases: ['Leeds United', 'Leeds'] },
  { ru: 'Ноттингем Форест', short: 'НФ', aliases: ['Nottingham Forest', 'Nottingham'] },
  { ru: 'Самсунспор', short: 'САМ', aliases: ['Samsunspor'] },
  { ru: 'Коджаэлиспор', short: 'КОД', aliases: ['Kocaelispor'] },
  { ru: 'Ницца', short: 'НИЦ', aliases: ['Nice', 'OGC Nice'] },
  { ru: 'Парма', short: 'ПАР', aliases: ['Parma', 'Parma Calcio 1913'] },
  { ru: 'Севилья', short: 'СЕВ', aliases: ['Sevilla', 'Sevilla FC'] },
  { ru: 'Шальке 04', short: 'ШАЛ', aliases: ['Schalke', 'Schalke 04', 'FC Schalke 04'] },
  { ru: 'Торино', short: 'ТОР', aliases: ['Torino', 'Torino FC'] },
  { ru: 'Тулуза', short: 'ТУЛ', aliases: ['Toulouse', 'Toulouse FC'] },
  { ru: 'Осер', short: 'ОСЕ', aliases: ['Auxerre', 'AJ Auxerre'] },
  { ru: 'Падерборн', short: 'ПАД', aliases: ['SC Paderborn', 'SC Paderborn 07', 'Paderborn'] },
  { ru: 'Халл Сити', short: 'ХАЛ', aliases: ['Hull City', 'Hull'] },
  { ru: 'Аталанта', short: 'АТА', aliases: ['Atalanta', 'Atalanta BC'] },
  { ru: 'Фрозиноне', short: 'ФРО', aliases: ['Frosinone', 'Frosinone Calcio'] },
  { ru: 'Венеция', short: 'ВЕН', aliases: ['Venezia', 'Venezia FC'] },
  { ru: 'Хетафе', short: 'ХЕТ', aliases: ['Getafe', 'Getafe CF'] },
  { ru: 'Ле-Ман', short: 'ЛЕМ', aliases: ['Le Mans', 'Le Mans FC'] },
  { ru: 'Лорьян', short: 'ЛОР', aliases: ['Lorient', 'FC Lorient'] },
  { ru: 'Расинг Сантандер', short: 'РАС', aliases: ['Racing Santander', 'Real Racing Club'] },
  { ru: 'Труа', short: 'ТРУ', aliases: ['Troyes', 'ESTAC Troyes'] },
  { ru: 'Гавр', short: 'ГАВ', aliases: ['Le Havre', 'Le Havre AC'] },
  { ru: 'Леванте', short: 'ЛЕВ', aliases: ['Levante', 'Levante UD'] },
  { ru: 'Эльче', short: 'ЭЛЬ', aliases: ['Elche', 'Elche CF'] },
  { ru: 'Эспаньол', short: 'ЭСП', aliases: ['Espanyol', 'RCD Espanyol'] },
  { ru: 'Осасуна', short: 'ОСА', aliases: ['Osasuna', 'CA Osasuna'] },
  { ru: 'Райо Вальекано', short: 'РАЙ', aliases: ['Rayo Vallecano'] },
  { ru: 'Валенсия', short: 'ВАЛ', aliases: ['Valencia', 'Valencia CF'] },
  { ru: 'Малага', short: 'МАЛ', aliases: ['Málaga', 'Malaga'] },
  { ru: 'Аугсбург', short: 'АУГ', aliases: ['Augsburg', 'FC Augsburg'] },
  { ru: 'Майнц 05', short: 'МАЙ', aliases: ['Mainz', 'Mainz 05', '1. FSV Mainz 05'] },
  { ru: 'Кёльн', short: 'КЁЛ', aliases: ['1. FC Köln', 'FC Koln', '1. FC Koln', 'Koln', 'Cologne'] },
  { ru: 'Фиорентина', short: 'ФИО', aliases: ['Fiorentina', 'ACF Fiorentina'] },
  { ru: 'Монца', short: 'МОН', aliases: ['Monza', 'AC Monza'] },
];

const INDEX = new Map<string, TeamDisplay>();

for (const entry of [...ENTRIES, ...CLUB_ENTRIES]) {
  const display: TeamDisplay = { name: entry.ru, short: entry.short };
  INDEX.set(norm(entry.ru), display);
  for (const alias of entry.aliases ?? []) {
    INDEX.set(norm(alias), display);
  }
}

function fallbackShort(name: string): string {
  const letters = Array.from(name.replace(/[^\p{L}\p{N} ]/gu, '').trim());
  const word = letters.join('');
  if (!word) return '—';
  // Берём первые 3 буквы первого слова (по-русски или латиницей).
  const firstWord = word.split(/\s+/)[0] ?? word;
  return firstWord.slice(0, 3).toUpperCase();
}

/** Полное и короткое отображение для имени команды. */
export function teamDisplay(name: string | null | undefined): TeamDisplay {
  const raw = (name ?? '').trim();
  if (!raw) return { name: '—', short: '—' };
  const found = INDEX.get(norm(raw));
  if (found) return found;
  return { name: raw, short: fallbackShort(raw) };
}

/** Русское (если известно) название для хранения/показа. */
export function teamNameRu(name: string | null | undefined): string {
  return teamDisplay(name).name;
}

/** Короткое обозначение (для компактных карточек). */
export function teamShort(name: string | null | undefined): string {
  return teamDisplay(name).short;
}
