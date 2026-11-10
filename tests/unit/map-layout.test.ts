import { describe, expect, it } from 'vitest';
import {
  AUTUMN_UNTIL,
  CELLS_TOTAL,
  MAP_COLS,
  MAP_ROWS,
  PATH_BOUNDS,
  PATH_POINTS,
  buildPathD,
  cellPoint,
  pointPx,
  stackOffset,
} from '@/lib/game/map-layout';

describe('cellPoint', () => {
  it('даёт ровно 80 точек', () => {
    expect(PATH_POINTS).toHaveLength(CELLS_TOTAL);
    expect(CELLS_TOTAL).toBe(MAP_ROWS * MAP_COLS);
  });

  it('индексы идут подряд от 1 до 80', () => {
    expect(PATH_POINTS.map((p) => p.idx)).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
  });

  it('зажимает индекс в границы 1..80', () => {
    expect(cellPoint(0).idx).toBe(1);
    expect(cellPoint(-40).idx).toBe(1);
    expect(cellPoint(999).idx).toBe(80);
    expect(cellPoint(80.9).idx).toBe(80);
  });

  it('старт в левом нижнем углу, финиш — в левом верхнем', () => {
    expect(cellPoint(1)).toMatchObject({ x: PATH_BOUNDS.left, y: PATH_BOUNDS.bottom });
    expect(cellPoint(80).x).toBeCloseTo(PATH_BOUNDS.left, 10);
    expect(cellPoint(80).y).toBeCloseTo(PATH_BOUNDS.top, 10);
  });

  it('змейка: чётные ряды слева направо, нечётные — справа налево', () => {
    expect(cellPoint(1).x).toBeCloseTo(PATH_BOUNDS.left, 10);
    expect(cellPoint(MAP_COLS).x).toBeCloseTo(PATH_BOUNDS.right, 10);
    // 21-я клетка открывает второй ряд и стоит справа — путь разворачивается.
    expect(cellPoint(MAP_COLS + 1).x).toBeCloseTo(PATH_BOUNDS.right, 10);
    expect(cellPoint(MAP_COLS * 2).x).toBeCloseTo(PATH_BOUNDS.left, 10);
  });

  it('каждый ряд выше предыдущего', () => {
    const rowY = [1, 21, 41, 61].map((idx) => cellPoint(idx).y);
    expect(rowY).toEqual([...rowY].sort((a, b) => b - a));
  });

  it('все точки внутри игрового поля', () => {
    for (const point of PATH_POINTS) {
      expect(point.x).toBeGreaterThanOrEqual(PATH_BOUNDS.left);
      expect(point.x).toBeLessThanOrEqual(PATH_BOUNDS.right);
      expect(point.y).toBeGreaterThanOrEqual(PATH_BOUNDS.top);
      expect(point.y).toBeLessThanOrEqual(PATH_BOUNDS.bottom);
    }
  });

  it('делит карту на осеннюю и зимнюю зоны', () => {
    expect(cellPoint(AUTUMN_UNTIL).zone).toBe('autumn');
    expect(cellPoint(AUTUMN_UNTIL + 1).zone).toBe('winter');
    expect(cellPoint(80).zone).toBe('winter');
  });

  it('детерминирован', () => {
    expect(cellPoint(37)).toEqual(cellPoint(37));
  });
});

describe('buildPathD', () => {
  const d = buildPathD();

  it('начинается с M и содержит по команде на клетку', () => {
    expect(d.startsWith('M ')).toBe(true);
    expect(d.match(/[ML]/g)).toHaveLength(CELLS_TOTAL);
  });

  it('координаты в пикселях фона и с одним знаком после точки', () => {
    const coords = d.replace(/[ML]/g, ' ').trim().split(/\s+/);
    expect(coords).toHaveLength(CELLS_TOTAL * 2);
    for (const value of coords) {
      expect(value).toMatch(/^-?\d+\.\d$/);
    }
  });

  it('строится из переданных точек', () => {
    const custom = buildPathD([
      { idx: 1, x: 0, y: 0, zone: 'autumn' },
      { idx: 2, x: 1, y: 0.5, zone: 'autumn' },
    ]);
    expect(custom).toBe('M 0.0 0.0 L 4096.0 1024.0');
  });
});

describe('pointPx', () => {
  it('переводит нормализованные координаты в пиксели 4096×2048', () => {
    expect(pointPx(1)).toEqual({ x: PATH_BOUNDS.left * 4096, y: PATH_BOUNDS.bottom * 2048 });
    expect(pointPx(80).x).toBeCloseTo(PATH_BOUNDS.left * 4096, 8);
    expect(pointPx(80).y).toBeCloseTo(PATH_BOUNDS.top * 2048, 8);
  });
});

describe('stackOffset', () => {
  it('один игрок стоит ровно на клетке', () => {
    expect(stackOffset(0, 1)).toEqual({ x: 0, y: 0 });
    expect(stackOffset(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('округляет до сотых — иначе SSR и браузер расходятся в последнем бите', () => {
    for (let total = 2; total <= 6; total++) {
      for (let slot = 0; slot < total; slot++) {
        const offset = stackOffset(slot, total);
        expect(Math.round(offset.x * 100) / 100).toBe(offset.x);
        expect(Math.round(offset.y * 100) / 100).toBe(offset.y);
      }
    }
  });

  it('детерминирован', () => {
    expect(stackOffset(2, 6)).toEqual(stackOffset(2, 6));
  });

  it('разводит игроков по разным точкам', () => {
    const seen = new Set(
      Array.from({ length: 6 }, (_, slot) => {
        const { x, y } = stackOffset(slot, 6);
        return `${x}:${y}`;
      }),
    );
    expect(seen.size).toBe(6);
  });

  it('держит смещение в компактном радиусе', () => {
    for (let total = 2; total <= 6; total++) {
      for (let slot = 0; slot < total; slot++) {
        const { x, y } = stackOffset(slot, total);
        expect(Math.abs(x)).toBeLessThanOrEqual(26);
        expect(Math.abs(y)).toBeLessThanOrEqual(16);
      }
    }
  });
});
