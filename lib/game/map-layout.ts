/**
 * Геометрия карты: 80 точек пути в нормализованных координатах 0..1.
 * Одна и та же раскладка для фона, маркеров и персонажей — поэтому
 * координаты живут в коде, а не в БД (в БД только оверрайды админа).
 *
 * Путь — змейка из 4 рядов по 20 клеток. Ряды идут снизу вверх,
 * как дорожка настольной игры; концы рядов соединяются поворотами.
 */

export type MapPoint = { idx: number; x: number; y: number; zone: 'autumn' | 'winter' };

export const MAP_ROWS = 4;
export const MAP_COLS = 20;
export const CELLS_TOTAL = MAP_ROWS * MAP_COLS;

/** Границы игрового поля в координатах фона. */
export const PATH_BOUNDS = {
  left: 0.055,
  right: 0.945,
  bottom: 0.795,
  top: 0.235,
} as const;

/** Первые клетки — поздняя осень, остальные — зима (docs/03 §3). */
export const AUTUMN_UNTIL = 16;

export function cellPoint(idx: number): MapPoint {
  const clamped = Math.min(CELLS_TOTAL, Math.max(1, Math.trunc(idx)));
  const zero = clamped - 1;
  const row = Math.floor(zero / MAP_COLS);
  const col = zero % MAP_COLS;
  const reversed = row % 2 === 1;
  const effectiveCol = reversed ? MAP_COLS - 1 - col : col;

  const t = effectiveCol / (MAP_COLS - 1);
  const span = PATH_BOUNDS.right - PATH_BOUNDS.left;
  const rowSpan = PATH_BOUNDS.bottom - PATH_BOUNDS.top;

  return {
    idx: clamped,
    x: PATH_BOUNDS.left + span * t,
    y: PATH_BOUNDS.bottom - rowSpan * (row / (MAP_ROWS - 1)),
    zone: clamped <= AUTUMN_UNTIL ? 'autumn' : 'winter',
  };
}

export const PATH_POINTS: readonly MapPoint[] = Array.from({ length: CELLS_TOTAL }, (_, i) => cellPoint(i + 1));

/**
 * SVG-путь через все 80 точек. Ряды соединяются вертикальными
 * поворотами; скругление даёт `stroke-linejoin: round`.
 */
export function buildPathD(points: readonly MapPoint[] = PATH_POINTS): string {
  return points
    .map((point, i) => `${i === 0 ? 'M' : 'L'} ${(point.x * 4096).toFixed(1)} ${(point.y * 2048).toFixed(1)}`)
    .join(' ');
}

/** Координаты в пикселях фона 4096×2048 — удобно для SVG. */
export function pointPx(idx: number): { x: number; y: number } {
  const p = cellPoint(idx);
  return { x: p.x * 4096, y: p.y * 2048 };
}

/** Куда сдвигать персонажей, если они стоят на одной клетке. */
export function stackOffset(slotIndex: number, total: number): { x: number; y: number } {
  if (total <= 1) return { x: 0, y: 0 };
  const radius = total > 4 ? 26 : 20;
  const angle = (Math.PI * 2 * slotIndex) / total - Math.PI / 2;
  // Округление до сотых: тригонометрия в Node и браузере может
  // отличаться в последнем бите, а стили сравниваются как строки.
  return {
    x: Math.round(Math.cos(angle) * radius * 100) / 100,
    y: Math.round(Math.sin(angle) * radius * 0.6 * 100) / 100,
  };
}
