import { describe, expect, it } from 'vitest';
import { diceForDay, DICE_SIDES, participationOk } from '@/lib/game/dice';

describe('участие', () => {
  it('порог 80% убран: кубик положен при наличии вопросов дня', () => {
    expect(participationOk(0, 10)).toBe(true);
    expect(participationOk(1, 10)).toBe(true);
    expect(participationOk(8, 10)).toBe(true);
  });

  it('нет вопросов — участия нет', () => {
    expect(participationOk(0, 0)).toBe(false);
  });
});

describe('тиры кубика (целочисленная математика)', () => {
  const cases: Array<[number, number, 'wood' | 'bronze' | 'silver' | 'gold']> = [
    [20, 0, 'wood'],
    [20, 1, 'bronze'],
    [20, 6, 'bronze'],
    [20, 7, 'silver'],
    [20, 13, 'silver'],
    [20, 14, 'gold'],
    [20, 20, 'gold'],
    [16, 0, 'wood'],
    [16, 5, 'bronze'],
    [16, 6, 'silver'],
    [16, 10, 'silver'],
    [16, 11, 'gold'],
    [12, 0, 'wood'],
    [12, 3, 'bronze'],
    [12, 4, 'silver'],
    [12, 7, 'silver'],
    [12, 8, 'gold'],
    [4, 0, 'wood'],
    [4, 1, 'bronze'],
    [4, 2, 'silver'],
    [4, 3, 'gold'],
    [3, 0, 'wood'],
    [3, 1, 'silver'],
    [3, 2, 'gold'],
  ];

  it.each(cases)('Q=%i C=%i → %s', (q, c, tier) => {
    const result = diceForDay({ qTotal: q, answered: q, correct: c, exactScoreHit: false });
    expect(result.base).toBe(tier);
    expect(result.bonus).toBeNull();
  });

  it('ровно 1/3 — серебро, ровно 2/3 — золото', () => {
    expect(diceForDay({ qTotal: 3, answered: 3, correct: 1, exactScoreHit: false }).base).toBe('silver');
    expect(diceForDay({ qTotal: 3, answered: 3, correct: 2, exactScoreHit: false }).base).toBe('gold');
  });
});

describe('выдача кубика без порога участия', () => {
  it('даже без ответов и без угаданных — деревянный кубик', () => {
    const result = diceForDay({ qTotal: 20, answered: 0, correct: 0, exactScoreHit: false });
    expect(result.base).toBe('wood');
    expect(result.bonus).toBeNull();
  });

  it('ответил мало, но кубик всё равно положен', () => {
    const result = diceForDay({ qTotal: 20, answered: 2, correct: 0, exactScoreHit: false });
    expect(result.base).toBe('wood');
  });
});

describe('бонус за точный счёт', () => {
  it('даёт один золотой сверху', () => {
    const result = diceForDay({ qTotal: 12, answered: 12, correct: 8, exactScoreHit: true });
    expect(result.base).toBe('gold');
    expect(result.bonus).toBe('gold');
  });

  it('без точного счёта бонуса нет', () => {
    const result = diceForDay({ qTotal: 12, answered: 12, correct: 8, exactScoreHit: false });
    expect(result.bonus).toBeNull();
  });

  it('при Q=0 кубиков нет вообще', () => {
    const result = diceForDay({ qTotal: 0, answered: 0, correct: 0, exactScoreHit: true });
    expect(result.base).toBeNull();
    expect(result.bonus).toBeNull();
  });
});

describe('грани сторон', () => {
  it('wood 2, bronze 3, silver 4, gold 6', () => {
    expect(DICE_SIDES).toEqual({ wood: 2, bronze: 3, silver: 4, gold: 6 });
  });
});
