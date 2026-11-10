import { describe, expect, it } from 'vitest';
import { gameDateOf, gameDayWindow, formatMsk, MSK_OFFSET_MINUTES } from '@/lib/time';

/** Хелпер: собрать UTC-дату из московского времени. */
function msk(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min) - MSK_OFFSET_MINUTES * 60_000);
}

describe('gameDateOf: нарезка игрового дня по МСК', () => {
  it('вечерний матч относится к текущему дню', () => {
    expect(gameDateOf(msk(2026, 11, 9, 21, 0))).toBe('2026-11-09');
  });

  it('матч в 22:00 относится к текущему дню', () => {
    expect(gameDateOf(msk(2026, 11, 9, 22, 0))).toBe('2026-11-09');
  });

  it('матч в 00:30 относится к прошлому игровому дню', () => {
    expect(gameDateOf(msk(2026, 11, 10, 0, 30))).toBe('2026-11-09');
  });

  it('матч в 02:00 относится к прошлому игровому дню', () => {
    expect(gameDateOf(msk(2026, 11, 10, 2, 0))).toBe('2026-11-09');
  });

  it('08:59 ещё прошлый день', () => {
    expect(gameDateOf(msk(2026, 11, 10, 8, 59))).toBe('2026-11-09');
  });

  it('09:00 уже новый день', () => {
    expect(gameDateOf(msk(2026, 11, 10, 9, 0))).toBe('2026-11-10');
  });

  it('воскресенье 23:45 остаётся воскресеньем', () => {
    expect(gameDateOf(msk(2026, 11, 8, 23, 45))).toBe('2026-11-08');
  });

  it('ночь 1 января относится к 31 декабря', () => {
    expect(gameDateOf(msk(2027, 1, 1, 2, 0))).toBe('2026-12-31');
  });

  it('ночь 1 марта относится к 28 февраля', () => {
    expect(gameDateOf(msk(2027, 3, 1, 3, 0))).toBe('2027-02-28');
  });
});

describe('gameDayWindow', () => {
  it('окно дня 12 ноября: 09:00 МСК — 08:59:59 МСК следующего дня', () => {
    const { opensAt, closesAt } = gameDayWindow('2026-11-12');
    expect(opensAt.toISOString()).toBe('2026-11-12T06:00:00.000Z');
    expect(closesAt.toISOString()).toBe('2026-11-13T05:59:59.999Z');
  });

  it('матч 02:00 следующего утра попадает в окно предыдущего дня', () => {
    const { opensAt, closesAt } = gameDayWindow('2026-11-12');
    const lateMatch = msk(2026, 11, 13, 2, 0);
    expect(lateMatch >= opensAt && lateMatch <= closesAt).toBe(true);
  });

  it('матч 09:00 следующего дня уже вне окна', () => {
    const { closesAt } = gameDayWindow('2026-11-12');
    expect(msk(2026, 11, 13, 9, 0) > closesAt).toBe(true);
  });
});

describe('formatMsk', () => {
  it('показывает время с подписью МСК', () => {
    expect(formatMsk(msk(2026, 11, 12, 22, 0))).toBe('22:00 МСК');
    expect(formatMsk(msk(2026, 11, 13, 2, 5))).toBe('02:05 МСК');
  });
});
