/**
 * Переходы статусов игрового дня (docs/DECISIONS.md, D4).
 *
 * Чистая функция без БД: cron читает матчи дня, спрашивает «какой статус
 * должен быть», и только потом пишет. Так переходы проверяются тестами,
 * а не воспроизводятся вручную на проде.
 */

export type MatchdayStatus = 'scheduled' | 'locked' | 'live' | 'resolving' | 'closed';

export type MatchStatus = 'NS' | 'LIVE' | 'HT' | 'FT' | 'PST' | 'CANC' | 'ABD';

export type DayMatch = {
  status: MatchStatus;
  /** Старт матча, epoch ms. */
  kickoffMs: number;
};

const FINAL: readonly MatchStatus[] = ['FT', 'PST', 'CANC', 'ABD'];

/** Страховка: через 3 часа после окна дня закрываем по тому, что есть. */
export const RESOLVE_GRACE_MS = 3 * 60 * 60 * 1000;

export function isFinalMatch(status: MatchStatus): boolean {
  return FINAL.includes(status);
}

export function allMatchesFinal(matches: readonly DayMatch[]): boolean {
  return matches.length > 0 && matches.every((match) => isFinalMatch(match.status));
}

/**
 * Какой статус должен быть у дня сейчас.
 *
 * - все матчи финальные → `resolving` (закрытие делает резолв);
 * - окно дня истекло более 3 часов назад → `resolving` (страховка);
 * - есть живой матч → `live`;
 * - первый матч уже начался → `locked` (новые вопросы не создаются);
 * - иначе — `scheduled`; уже закрытый день не переоткрывается.
 */
export function nextMatchdayStatus(input: {
  current: MatchdayStatus;
  matches: readonly DayMatch[];
  nowMs: number;
  closesAtMs: number;
}): MatchdayStatus {
  const { current, matches, nowMs, closesAtMs } = input;

  if (current === 'closed') return 'closed';
  if (allMatchesFinal(matches)) return 'resolving';

  // День истёк, но данные не пришли: закрываем по тому, что есть.
  if (Number.isFinite(closesAtMs) && nowMs > closesAtMs + RESOLVE_GRACE_MS) return 'resolving';

  const live = matches.some((match) => match.status === 'LIVE' || match.status === 'HT');
  if (live) return 'live';

  const started = matches.some((match) => Number.isFinite(match.kickoffMs) && match.kickoffMs <= nowMs);

  if (current === 'scheduled' || current === 'locked') return started ? 'locked' : 'scheduled';

  // `live`/`resolving` без живых матчей не откатываем вниз: синк мог
  // не отдать статус, и резолв всё равно дождётся финального счёта.
  return current;
}
