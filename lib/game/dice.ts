/**
 * Экономика кубиков (docs/02-matchday-and-data.md, раздел 4.3).
 *
 * Вся математика целочисленная: пороги 1/3 и 2/3 проверяются умножением,
 * без делений и округлений. Это исключает расхождение между сервером,
 * клиентом и тестами.
 */

export type DiceTier = 'wood' | 'bronze' | 'silver' | 'gold';

export const DICE_SIDES: Record<DiceTier, number> = {
  wood: 2,
  bronze: 3,
  silver: 4,
  gold: 6,
};

export const DICE_TIER_LABEL: Record<DiceTier, string> = {
  wood: 'деревянный',
  bronze: 'бронзовый',
  silver: 'серебряный',
  gold: 'золотой',
};

/**
 * Исторический порог участия (раньше требовалось 80% ответов).
 * Теперь порог не применяется: при наличии вопросов дня кубик выдаётся всем.
 */
export const PARTICIPATION_THRESHOLD_PERCENT = 0;

export type DayDiceInput = {
  /** Q — число действительных обычных вопросов дня. */
  qTotal: number;
  /** A — сколько обычных вопросов игрок ответил. */
  answered: number;
  /** C — сколько из них верных. */
  correct: number;
  /** Угадан ли хотя бы один точный счёт (бонусный вопрос). */
  exactScoreHit: boolean;
};

export type DayDiceResult = {
  base: DiceTier | null;
  bonus: DiceTier | null;
  /** Доля ответов, 0..1, для UI и рейтинга. */
  participation: number;
  /** Доля верных среди действительных вопросов, 0..1. */
  accuracy: number;
};

/** Порог участия больше не применяется: при наличии вопросов дня кубик положен всегда. */
export function participationOk(answered: number, qTotal: number): boolean {
  if (qTotal <= 0) return false;
  return true;
}

/**
 * Тиры: 0 верных — деревянный, 3C >= 2Q → золото, 3C >= Q → серебро,
 * иначе бронза.
 */
export function tierFor(qTotal: number, correct: number): DiceTier {
  if (qTotal <= 0) return 'wood';
  if (correct <= 0) return 'wood';
  if (correct * 3 >= qTotal * 2) return 'gold';
  if (correct * 3 >= qTotal) return 'silver';
  return 'bronze';
}

export function diceForDay({ qTotal, answered, correct, exactScoreHit }: DayDiceInput): DayDiceResult {
  const safeQ = Math.max(0, Math.trunc(qTotal));
  const safeA = Math.min(safeQ, Math.max(0, Math.trunc(answered)));
  const safeC = Math.min(safeA, Math.max(0, Math.trunc(correct)));

  const participation = safeQ === 0 ? 0 : safeA / safeQ;
  const accuracy = safeQ === 0 ? 0 : safeC / safeQ;

  if (safeQ === 0) {
    return { base: null, bonus: null, participation, accuracy };
  }

  return {
    base: tierFor(safeQ, safeC),
    bonus: exactScoreHit ? 'gold' : null,
    participation,
    accuracy,
  };
}

/** Безопасный бросок на сервере: значение 1..sides. */
export function rollValue(tier: DiceTier, random: () => number): number {
  const sides = DICE_SIDES[tier];
  const normalized = Math.min(0.999999999, Math.max(0, random()));
  return Math.floor(normalized * sides) + 1;
}

/**
 * Итоговое перемещение с учётом Трибун (+1) и Газона (−1).
 * Оба модификатора расходуются, даже если взаимно компенсировались.
 */
export function applyRollModifiers(
  value: number,
  mods: { tribuny: boolean; gazon: boolean },
): { value: number; consumed: { tribuny: boolean; gazon: boolean } } {
  let result = value;
  if (mods.tribuny) result += 1;
  if (mods.gazon) result -= 1;
  return {
    value: Math.max(1, result),
    consumed: { tribuny: mods.tribuny, gazon: mods.gazon },
  };
}

/** Куда встанет игрок, с учётом границ поля. */
export function landingPosition(from: number, steps: number, lastCell = 80): number {
  return Math.min(lastCell, Math.max(1, from + steps));
}
