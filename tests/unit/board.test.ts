import { describe, expect, it } from 'vitest';
import { generateBoard, mulberry32, expandWeights, DEFAULT_WEIGHTS } from '@/lib/game/board';

describe('mulberry32', () => {
  it('детерминирован для одного сида', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('разные сиды дают разные последовательности', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('значения в диапазоне [0, 1)', () => {
    const rnd = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = rnd();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('expandWeights', () => {
  it('разворачивает веса ровно в 40 механик', () => {
    const list = expandWeights(DEFAULT_WEIGHTS, 40);
    expect(list).toHaveLength(40);
  });

  it('сумма весов не обязана быть 40 — нормализуется крупными остатками', () => {
    const list = expandWeights({ '01': 1, '02': 1, '03': 1 }, 40);
    expect(list).toHaveLength(40);
    const counts = list.reduce<Record<string, number>>((acc, code) => {
      acc[code] = (acc[code] ?? 0) + 1;
      return acc;
    }, {});
    expect(Object.keys(counts)).toHaveLength(3);
    // 40 / 3 ≈ 13.33 → 14/13/13
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(14);
    expect(Math.min(...Object.values(counts))).toBeGreaterThanOrEqual(13);
  });

  it('не теряет механики с нулевым округлением', () => {
    const list = expandWeights({ '01': 39, '02': 1 }, 40);
    expect(list.filter((c) => c === '02')).toHaveLength(1);
  });
});

describe('generateBoard', () => {
  const board = generateBoard(12345);

  it('ровно 80 клеток', () => {
    expect(board.cells).toHaveLength(80);
  });

  it('клетка 1 — старт, клетка 80 — финиш', () => {
    expect(board.cells[0]?.kind).toBe('start');
    expect(board.cells[79]?.kind).toBe('finish');
  });

  it('40 событийных и 40 обычных (включая старт и финиш)', () => {
    const events = board.cells.filter((c) => c.kind === 'event');
    const plain = board.cells.filter((c) => c.kind === 'plain' || c.kind === 'start' || c.kind === 'finish');
    expect(events).toHaveLength(40);
    expect(plain).toHaveLength(40);
  });

  it('первые 5 клеток без событий', () => {
    expect(board.cells.slice(0, 5).every((c) => c.kind !== 'event')).toBe(true);
  });

  it('в первой половине минимум 8 разных механик', () => {
    const codes = new Set(
      board.cells.slice(0, 40).filter((c) => c.kind === 'event').map((c) => c.mechanicCode),
    );
    expect(codes.size).toBeGreaterThanOrEqual(8);
  });

  it('без подряд идущих одинаковых механик на соседних event-клетках', () => {
    for (let i = 1; i < board.cells.length; i++) {
      const prev = board.cells[i - 1];
      const cur = board.cells[i];
      if (prev?.kind === 'event' && cur?.kind === 'event') {
        expect(prev.mechanicCode).not.toBe(cur.mechanicCode);
      }
    }
  });

  it('после безопасного старта есть ранний ритм событий (не пустыня из plain)', () => {
    const eventsEarly = board.cells.slice(5, 13).filter((c) => c.kind === 'event').length;
    const eventsFirst20 = board.cells.slice(0, 20).filter((c) => c.kind === 'event').length;
    expect(eventsEarly).toBeGreaterThanOrEqual(3);
    expect(eventsFirst20).toBeGreaterThanOrEqual(5);

    let plainRun = 0;
    let maxPlainRunFirst20 = 0;
    for (let i = 0; i < 20; i++) {
      const cell = board.cells[i];
      if (cell?.kind === 'event') plainRun = 0;
      else if (i >= 5) {
        plainRun += 1;
        maxPlainRunFirst20 = Math.max(maxPlainRunFirst20, plainRun);
      }
    }
    expect(maxPlainRunFirst20).toBeLessThanOrEqual(4);
  });

  it('у событийной клетки есть код механики, у обычной — нет', () => {
    for (const cell of board.cells) {
      if (cell.kind === 'event') expect(cell.mechanicCode).toMatch(/^\d{2}$/);
      else expect(cell.mechanicCode).toBeNull();
    }
  });

  it('воспроизводим по сиду', () => {
    const again = generateBoard(12345);
    expect(again.cells).toEqual(board.cells);
    expect(again.seed).toBe(board.seed);
  });

  it('разные сиды дают разные раскладки', () => {
    const other = generateBoard(999);
    expect(other.cells).not.toEqual(board.cells);
  });

  it('индексы идут подряд от 1 до 80', () => {
    expect(board.cells.map((c) => c.idx)).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
  });
});
