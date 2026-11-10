/**
 * Безопасные ветки для брошенных ожиданий (DECISIONS D7).
 *
 * Игрок может закрыть вкладку на выборе VAR, тактики, раздевалки или
 * передачи. Через 24 часа cron применяет за него самый безобидный вариант,
 * чтобы ожидание не блокировало броски навсегда.
 *
 * Решение — чистая функция: cron только исполняет его в транзакции.
 */

import { NEGATIVE_EFFECTS, type ActiveEffect, type EffectCode } from './engine';

export type ExpiryDecision =
  | { kind: 'var'; contest: false }
  | { kind: 'tactics'; delta: 0 }
  | { kind: 'locker'; remove: EffectCode | 'advance' }
  | { kind: 'passage'; targetId: null };

export const EXPIRABLE_KINDS = ['var', 'tactics', 'locker', 'passage'] as const;

export type ExpirableKind = (typeof EXPIRABLE_KINDS)[number];

export function isExpirableKind(kind: string): kind is ExpirableKind {
  return (EXPIRABLE_KINDS as readonly string[]).includes(kind);
}

/**
 * Какой вариант судья выбирает за игрока.
 *
 * - VAR → принять решение (−1): оспаривание — добровольный риск, авто-выбор
 *   не должен случайно отбросить игрока назад;
 * - тактика → «оставить»: бросок уже сохранён и не двигается;
 * - раздевалка → снять первый негатив, иначе шаг вперёд;
 * - передача → остаться на месте.
 *
 * `null` — ожидание не из списка D7, его закрывает админ вручную.
 */
export function expiryDecision(kind: string, effects: readonly ActiveEffect[] = []): ExpiryDecision | null {
  switch (kind) {
    case 'var':
      return { kind: 'var', contest: false };
    case 'tactics':
      return { kind: 'tactics', delta: 0 };
    case 'locker': {
      const negative = effects.find((effect) => NEGATIVE_EFFECTS.includes(effect.code) && effect.charges > 0);
      return { kind: 'locker', remove: negative ? negative.code : 'advance' };
    }
    case 'passage':
      return { kind: 'passage', targetId: null };
    default:
      return null;
  }
}

/** Строка в ленту: кто пропустил выбор и что решил судья. */
export function expiryLog(who: string, decision: ExpiryDecision): string {
  let detail: string;
  switch (decision.kind) {
    case 'var':
      detail = 'принимаем решение, минус одна клетка';
      break;
    case 'tactics':
      detail = 'бросок остаётся как есть';
      break;
    case 'locker':
      detail = decision.remove === 'advance' ? 'шаг вперёд' : 'негатив снят';
      break;
    case 'passage':
      detail = 'остаётся на месте';
      break;
  }

  return `${who} не ответил — судья решил за него: ${detail}.`;
}
