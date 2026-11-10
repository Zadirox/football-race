import { describe, expect, it } from 'vitest';
import { stepSequence, walkDelay } from '@/lib/game/walk';

describe('walk', () => {
  it('идёт вперёд по одной клетке', () => {
    expect(stepSequence(3, 8)).toEqual([4, 5, 6, 7, 8]);
  });

  it('идёт назад по одной клетке', () => {
    expect(stepSequence(5, 2)).toEqual([4, 3, 2]);
  });

  it('обрезает по границам поля', () => {
    expect(stepSequence(79, 90)).toEqual([80]);
    expect(stepSequence(0, 2)).toEqual([2]);
    expect(stepSequence(1, 0)).toEqual([]);
  });

  it('не двигается, если позиция не изменилась', () => {
    expect(stepSequence(40, 40)).toEqual([]);
  });

  it('считает задержку шага', () => {
    expect(walkDelay(0)).toBe(0);
    expect(walkDelay(3)).toBe(660);
    expect(walkDelay(2, 140)).toBe(280);
  });
});
