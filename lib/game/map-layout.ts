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
  const baseY = PATH_BOUNDS.bottom - rowSpan * (row / (MAP_ROWS - 1));

  // Лёгкая волна вдоль ряда, чтобы маршрут выглядел аккуратной змейкой,
  // а не идеально прямыми линиями. На концах ряда смещение 0 — повороты стыкуются.
  const wave = Math.sin(t * Math.PI) * rowSpan * 0.085 * (row % 2 === 0 ? -1 : 1);
  const y = Math.max(PATH_BOUNDS.top, Math.min(PATH_BOUNDS.bottom, baseY + wave));

  return {
    idx: clamped,
    x: PATH_BOUNDS.left + span * t,
    y,
    zone: clamped <= AUTUMN_UNTIL ? 'autumn' : 'winter',
  };
}

export const PATH_POINTS: readonly MapPoint[] = Array.from({ length: CELLS_TOTAL }, (_, i) => cellPoint(i + 1));

/**
 * SVG-путь через все 80 точек. Сглаженный (катмулл-ром → кубические кривые),
 * чтобы маршрут выглядел естественнее, а не ломаной из прямых отрезков.
 * Клеточные якоря (cellPoint) при этом не меняются.
 */
export function buildPathD(points: readonly MapPoint[] = PATH_POINTS): string {
  if (points.length === 0) return '';
  const pts = points.map((point) => ({ x: point.x * 4096, y: point.y * 2048 }));
  const fmt = (n: number) => n.toFixed(1);

  if (pts.length === 1) return `M ${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)}`;
  if (pts.length === 2) {
    return `M ${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)} L ${fmt(pts[1]!.x)} ${fmt(pts[1]!.y)}`;
  }

  let d = `M ${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${fmt(cp1x)} ${fmt(cp1y)}, ${fmt(cp2x)} ${fmt(cp2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d;
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
