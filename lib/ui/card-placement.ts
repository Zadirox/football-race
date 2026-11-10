/**
 * Позиционирование карточки клетки (docs/03 §6).
 *
 * Чистая функция: считает экранные координаты по якорю маркера, размеру
 * карточки и вьюпорту. Живёт отдельно от компонента, чтобы края экрана
 * проверялись тестами, а не глазами.
 */

export type Rect = { left: number; top: number; width: number; height: number };

export type CardSize = { width: number; height: number };

export type Viewport = { width: number; height: number };

export type Placement = {
  left: number;
  top: number;
  side: 'top' | 'bottom';
  /** Горизонтальная позиция стрелки внутри карточки. */
  arrowX: number;
};

const DEFAULT_GAP = 14;
const DEFAULT_MARGIN = 12;
/** Стрелка не прижимается к скруглённым углам карточки. */
const ARROW_INSET = 16;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function placeCard(
  anchor: Rect,
  card: CardSize,
  viewport: Viewport,
  gap: number = DEFAULT_GAP,
  margin: number = DEFAULT_MARGIN,
): Placement {
  const centerX = anchor.left + anchor.width / 2;

  let side: Placement['side'] = 'top';
  let top = anchor.top - gap - card.height;

  if (top < margin) {
    side = 'bottom';
    top = anchor.top + anchor.height + gap;
  }

  const maxTop = viewport.height - card.height - margin;
  if (top > maxTop) top = Math.max(maxTop, margin);

  const maxLeft = viewport.width - card.width - margin;
  const left = clamp(centerX - card.width / 2, margin, maxLeft);

  const arrowX = clamp(centerX - left, ARROW_INSET, card.width - ARROW_INSET);

  return { left, top, side, arrowX };
}
