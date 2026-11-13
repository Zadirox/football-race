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
  { ru: 'Ирландия', short: 'ИРЛ', aliases: ['Republic of Ireland', 'Ireland'] },
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
  { ru: 'Северная Македония', short: 'СМАК', aliases: ['North Macedonia', 'Macedonia'] },
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

const INDEX = new Map<string, TeamDisplay>();

for (const entry of ENTRIES) {
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
