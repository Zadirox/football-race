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
  | { kind: 'passage'; targetId: null }
  | { kind: 'last_minute'; currentReward: 1 | 3 }
  | { kind: 'rematch'; outcome: 'cancelled' }
  | { kind: 'simulation'; outcome: 'cancelled' }
  | { kind: 'gentleman'; outcome: 'cancelled' }
  | { kind: 'training_base'; outcome: 'cancelled' }
  | { kind: 'guess_player'; outcome: 'cancelled' }
  | { kind: 'fan_sector'; outcome: 'cancelled' }
  | { kind: 'coach_contract'; outcome: 'cancelled' };

export const EXPIRABLE_KINDS = [
  'var',
  'tactics',
  'locker',
  'passage',
  'last_minute',
  'rematch',
  'simulation',
  'gentleman',
  'training_base',
  'guess_player',
  'fan_sector',
  'coach_contract',
] as const;

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
export function expiryDecision(
  kind: string,
  effects: readonly ActiveEffect[] = [],
  payload: Record<string, unknown> = {},
): ExpiryDecision | null {
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
    case 'last_minute': {
      // Safe default: take the minimum known reward if payload is missing/invalid.
      const reward = payload.currentReward === 3 ? 3 : 1;
      return { kind: 'last_minute', currentReward: reward };
    }
    case 'rematch':
      return { kind: 'rematch', outcome: 'cancelled' };
    case 'simulation':
      return { kind: 'simulation', outcome: 'cancelled' };
    case 'gentleman':
      return { kind: 'gentleman', outcome: 'cancelled' };
    case 'training_base':
      return { kind: 'training_base', outcome: 'cancelled' };
    case 'guess_player':
      return { kind: 'guess_player', outcome: 'cancelled' };
    case 'fan_sector':
      return { kind: 'fan_sector', outcome: 'cancelled' };
    case 'coach_contract':
      return { kind: 'coach_contract', outcome: 'cancelled' };
    default:
      return null;
  }
}

/** Partner pendings can be "waiting for other player" - they must not block rolls. */
export function isRollBlockingPending(payload: Record<string, unknown> = {}): boolean {
  return payload.waiting !== true;
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
    case 'last_minute':
      detail = `забирает текущую награду +${decision.currentReward}`;
      break;
    case 'rematch':
    case 'simulation':
    case 'gentleman':
      detail = 'ожидание партнёра закрыто без штрафа';
      break;
    case 'training_base':
    case 'guess_player':
    case 'fan_sector':
    case 'coach_contract':
      detail = 'событие закрыто без штрафа';
      break;
  }

  return `${who} не ответил — судья решил за него: ${detail}.`;
}
