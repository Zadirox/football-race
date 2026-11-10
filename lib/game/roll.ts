/**
 * Чистая часть броска: то, что можно посчитать без базы и без таймеров.
 *
 * Серверное действие (`lib/actions/game.ts`) читает состояние игрока,
 * спрашивает у этого модуля «что выпало и что осталось висеть», и только
 * потом пишет в БД. Поэтому правила кубиков и тактики проверяются
 * юнит-тестами на тех же функциях, что работают в бою.
 */

import { applyRollModifiers, rollValue, type DiceTier } from './dice';
import {
  applyTactics,
  hasEffect,
  spendCharge,
  takeRollModifiers,
  type ActiveEffect,
  type PlayerState,
} from './engine';

export type RollPlan = {
  /** Что выпало на кубике до модификаторов. */
  base: number;
  /** Итог броска: база + Трибуны − Газон, минимум 1. */
  value: number;
  /** Состояние после списания Трибун и Газона. */
  state: PlayerState;
  /** Нужен ли выбор «Тактической схемы» перед ходом. */
  needsTactics: boolean;
};

/**
 * Планирует бросок: снимает Трибуны и Газон (оба расходуются, даже если
 * компенсировали друг друга) и проверяет, висит ли Тактическая схема.
 */
export function planRoll(state: PlayerState, tier: DiceTier, random: () => number): RollPlan {
  const taken = takeRollModifiers(state);
  const base = rollValue(tier, random);
  const { value } = applyRollModifiers(base, taken.mods);

  return {
    base,
    value,
    state: taken.state,
    needsTactics: hasEffect(taken.state, 'tactics'),
  };
}

/**
 * Применяет выбор Тактической схемы: заряд списывается ровно один,
 * сдвиг ограничен одним шагом в любую сторону.
 */
export function applyTacticsChoice(
  state: PlayerState,
  value: number,
  delta: number,
): { state: PlayerState; value: number; delta: -1 | 0 | 1 } {
  const safeDelta = delta > 0 ? 1 : delta < 0 ? -1 : 0;

  return {
    state: spendCharge(state, 'tactics'),
    value: applyTactics(value, safeDelta),
    delta: safeDelta,
  };
}

/**
 * Эффекты к записи в БД: пустые заряды не храним, иначе таблица растёт
 * строками, которые ничего не делают.
 */
export function keptEffects(state: PlayerState): ActiveEffect[] {
  return state.effects.filter((effect) => effect.charges > 0);
}
