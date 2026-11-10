/**
 * Состояние приёма ответов (docs/02-matchday-and-data.md).
 *
 * Два независимых ограничения:
 *  1) поштучный лок вопроса — наступает в `kickoff_utc` его матча (`questions.locks_at`);
 *  2) окно игрового дня — 09:00 МСК дня D … 08:59:59 МСК дня D+1, страховка на случай,
 *     если матчи так и не получили финальный статус.
 *
 * Здесь только чистые проверки времени: сервер отдаёт `serverNow`, экраны считают от него,
 * чтобы не зависеть от часов браузера и не ловить рассинхрон при гидратации.
 */

import type { QuestionView, SeasonSnapshot } from '@/lib/types';

export type DayState = 'upcoming' | 'open' | 'closed';

export type MatchdayView = NonNullable<SeasonSnapshot['matchday']>;

/**
 * Фаза игрового дня на момент `nowMs`.
 *
 * - `closed` — день уже закрыт (явный статус) или истекло окно дня;
 * - `upcoming` — окно ещё не открылось, но ответы на будущие матчи уже принимаются;
 * - `open` — идёт игровой день.
 */
export function dayState(matchday: MatchdayView | null, nowMs: number): DayState {
  if (!matchday) return 'closed';
  if (matchday.status === 'closed') return 'closed';

  const closesAt = Date.parse(matchday.closesAt);
  if (Number.isFinite(closesAt) && nowMs >= closesAt) return 'closed';

  const opensAt = Date.parse(matchday.opensAt);
  if (Number.isFinite(opensAt) && nowMs < opensAt) return 'upcoming';

  return 'open';
}

/** Закрыт ли вопрос: статус снят с приёма или наступил старт его матча. */
export function questionLocked(question: QuestionView, nowMs: number): boolean {
  if (question.status !== 'open') return true;
  const locksAt = Date.parse(question.locksAt);
  return Number.isFinite(locksAt) && nowMs >= locksAt;
}

/** Можно ли ещё отправить ответ. */
export function canAnswer(question: QuestionView, matchday: MatchdayView | null, nowMs: number): boolean {
  if (dayState(matchday, nowMs) === 'closed') return false;
  return !questionLocked(question, nowMs);
}
