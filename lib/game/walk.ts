/**
 * Пошаговое движение по карте (docs/03 §7).
 *
 * Чистые помощники для анимации ходьбы: сервер двигает позицию сразу,
 * а клиент догоняет её шагами по одной клетке. Отдельный модуль — чтобы
 * границы поля и обратный ход проверялись тестами.
 */

export const BOARD_MIN = 1;
export const BOARD_MAX = 80;
export const STEP_MS = 220;

/** Промежуточные позиции, включая конечную, без стартовой. */
export function stepSequence(
  from: number,
  to: number,
  min: number = BOARD_MIN,
  max: number = BOARD_MAX,
): number[] {
  const clamp = (value: number) => Math.min(Math.max(Math.trunc(value), min), max);
  const start = clamp(from);
  const end = clamp(to);
  const direction = Math.sign(end - start);
  if (direction === 0) return [];

  const steps: number[] = [];
  for (let cell = start + direction; ; cell += direction) {
    steps.push(cell);
    if (cell === end) break;
  }
  return steps;
}

/** Задержка перед шагом с индексом 0 = 0 мс. */
export function walkDelay(stepIndex: number, msPerCell: number = STEP_MS): number {
  return Math.max(0, Math.trunc(stepIndex)) * msPerCell;
}
