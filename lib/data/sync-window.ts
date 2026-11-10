/**
 * Окно синка фикстур: [игровой день − 1, игровой день + 4] по МСК
 * (docs/02 §2.1). Чистая функция — чтобы окно проверялось тестом,
 * а не «на глаз» в проде.
 */

import { gameDateOf, shiftGameDate, type GameDate } from '@/lib/time';

export type SyncWindow = { from: GameDate; to: GameDate };

export function syncWindow(now: Date): SyncWindow {
  const today = gameDateOf(now);
  return { from: shiftGameDate(today, -1), to: shiftGameDate(today, 4) };
}
