import { describe, expect, it } from 'vitest';
import { placeCard } from '@/lib/ui/card-placement';

const cell = { left: 600, top: 400, width: 30, height: 30 };
const card = { width: 320, height: 180 };
const desktop = { width: 1280, height: 800 };

describe('placeCard', () => {
  it('ставит карточку над клеткой по центру', () => {
    expect(placeCard(cell, card, desktop)).toEqual({ left: 455, top: 206, side: 'top', arrowX: 160 });
  });

  it('разворачивает вниз, если сверху нет места', () => {
    const result = placeCard({ ...cell, top: 20 }, card, desktop);
    expect(result.side).toBe('bottom');
    expect(result.top).toBe(64);
  });

  it('прижимает к левому краю и держит стрелку внутри', () => {
    const result = placeCard({ ...cell, left: 4 }, card, desktop);
    expect(result.left).toBe(12);
    expect(result.arrowX).toBe(16);
  });

  it('прижимает к правому краю', () => {
    const result = placeCard({ ...cell, left: 1246 }, card, desktop);
    expect(result.left).toBe(948);
    expect(result.arrowX).toBe(304);
  });

  it('работает на мобильном вьюпорте', () => {
    const result = placeCard(
      { left: 180, top: 500, width: 30, height: 30 },
      { width: 320, height: 220 },
      { width: 390, height: 844 },
    );
    expect(result.left).toBe(35);
    expect(result.side).toBe('top');
  });

  it('прижимается к низу и не уходит за экран', () => {
    const result = placeCard(
      { left: 100, top: 60, width: 30, height: 30 },
      { width: 320, height: 240 },
      { width: 390, height: 300 },
    );
    expect(result.side).toBe('bottom');
    expect(result.top + 240).toBeLessThanOrEqual(288);
  });

  it('ставит вплотную к полю, если карточка шире вьюпорта', () => {
    const result = placeCard(cell, { width: 400, height: 100 }, { width: 320, height: 600 });
    expect(result.left).toBe(12);
  });

  it('уважает кастомные gap и margin', () => {
    const result = placeCard({ left: 600, top: 400, width: 20, height: 20 }, card, desktop, 8, 20);
    expect(result.top).toBe(212);
    expect(result.left).toBe(450);
  });
});
