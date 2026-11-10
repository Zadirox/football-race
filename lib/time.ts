/**
 * Время. Единственное место, где живёт логика МСК (см. docs/02-matchday-and-data.md).
 *
 * Москва с 2014 года живёт в фиксированном UTC+3 без перехода на летнее время,
 * поэтому смещение задано константой, а не вычисляется из IANA-базы.
 * Если правила изменятся — правится одна константа и тесты.
 */

export const MSK_OFFSET_MINUTES = 180;
export const MSK_TIMEZONE = 'Europe/Moscow';
/** Час МСК, с которого начинается новый игровой день. */
export const DAY_CUT_HOUR = 9;

const MSK_OFFSET_MS = MSK_OFFSET_MINUTES * 60_000;
const DAY_MS = 86_400_000;

export type GameDate = string; // 'YYYY-MM-DD'

/** Сдвигает календарную дату на N дней (без влияния часовых поясов). */
export function shiftGameDate(date: GameDate, days: number): GameDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const ts = Date.UTC(y, m - 1, d) + days * DAY_MS;
  return new Date(ts).toISOString().slice(0, 10);
}

/** Части московского времени для момента UTC. */
export function mskParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const shifted = new Date(date.getTime() + MSK_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

function pad(n: number, size = 2): string {
  return String(n).padStart(size, '0');
}

/** Игровой день, к которому относится матч: граница — 09:00 МСК. */
export function gameDateOf(kickoffUtc: Date): GameDate {
  const p = mskParts(kickoffUtc);
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return p.hour >= DAY_CUT_HOUR ? date : shiftGameDate(date, -1);
}

/** Окно игрового дня: 09:00:00 МСК дня D — 08:59:59.999 МСК дня D+1. */
export function gameDayWindow(gameDate: GameDate): { opensAt: Date; closesAt: Date } {
  const [y, m, d] = gameDate.split('-').map(Number) as [number, number, number];
  const opensAt = new Date(Date.UTC(y, m - 1, d, DAY_CUT_HOUR, 0, 0) - MSK_OFFSET_MS);
  const closesAt = new Date(opensAt.getTime() + DAY_MS - 1);
  return { opensAt, closesAt };
}

/** 'HH:mm МСК' */
export function formatMsk(date: Date): string {
  const p = mskParts(date);
  return `${pad(p.hour)}:${pad(p.minute)} МСК`;
}

/** 'D месяца, HH:mm МСК' для карточек матчей. */
const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const;

export function formatMskLong(date: Date): string {
  const p = mskParts(date);
  return `${p.day} ${MONTHS[p.month - 1]} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** Остаток до закрытия игрового дня, в миллисекундах (никогда не отрицательный). */
export function msUntilGameDayEnd(now: Date, gameDate: GameDate): number {
  const { closesAt } = gameDayWindow(gameDate);
  return Math.max(0, closesAt.getTime() - now.getTime());
}
