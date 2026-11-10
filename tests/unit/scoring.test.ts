import { describe, expect, it } from 'vitest';
import {
  accuracyOf,
  buildRatings,
  formatAccuracy,
  MIN_ANSWERS_FOR_ACCURACY,
  sortByAccuracy,
  sortByDistance,
  sortByPoints,
  type RatingInput,
} from '@/lib/game/scoring';

function row(overrides: Partial<RatingInput> & { profileId: string }): RatingInput {
  return {
    nickname: overrides.profileId,
    position: 1,
    points: 0,
    answered: 0,
    correct: 0,
    finishedAt: null,
    ...overrides,
  };
}

describe('дистанция', () => {
  it('сортирует по позиции', () => {
    const rows = [row({ profileId: 'a', position: 12 }), row({ profileId: 'b', position: 40 })];
    expect(sortByDistance(rows).map((r) => r.profileId)).toEqual(['b', 'a']);
  });

  it('при равной позиции выше тот, кто раньше финишировал', () => {
    const rows = [
      row({ profileId: 'late', position: 80, finishedAt: '2026-12-20T10:00:00Z' }),
      row({ profileId: 'early', position: 80, finishedAt: '2026-12-19T10:00:00Z' }),
    ];
    expect(sortByDistance(rows).map((r) => r.profileId)).toEqual(['early', 'late']);
  });

  it('при равенстве позиции и финиша решают очки', () => {
    const rows = [
      row({ profileId: 'few', position: 30, points: 10 }),
      row({ profileId: 'many', position: 30, points: 90 }),
    ];
    expect(sortByDistance(rows).map((r) => r.profileId)).toEqual(['many', 'few']);
  });
});

describe('очки', () => {
  it('сортирует по сумме, при равенстве — по позиции', () => {
    const rows = [
      row({ profileId: 'a', points: 50, position: 10 }),
      row({ profileId: 'b', points: 50, position: 12 }),
      row({ profileId: 'c', points: 90, position: 5 }),
    ];
    expect(sortByPoints(rows).map((r) => r.profileId)).toEqual(['c', 'b', 'a']);
  });
});

describe('точность', () => {
  it('считает долю верных', () => {
    expect(accuracyOf({ answered: 16, correct: 11 })).toBeCloseTo(0.6875);
    expect(accuracyOf({ answered: 0, correct: 0 })).toBeNull();
  });

  it('игроки с малой выборкой уходят вниз', () => {
    const rows = [
      row({ profileId: 'small', answered: 4, correct: 4 }),
      row({ profileId: 'big', answered: 40, correct: 20 }),
    ];
    expect(sortByAccuracy(rows).map((r) => r.profileId)).toEqual(['big', 'small']);
  });

  it('при достаточной выборке выше точность', () => {
    const rows = [
      row({ profileId: 'half', answered: MIN_ANSWERS_FOR_ACCURACY, correct: 15 }),
      row({ profileId: 'sharp', answered: MIN_ANSWERS_FOR_ACCURACY, correct: 24 }),
    ];
    expect(sortByAccuracy(rows).map((r) => r.profileId)).toEqual(['sharp', 'half']);
  });

  it('помечает мало данных и не даёт ранг точности', () => {
    const [rating] = buildRatings([row({ profileId: 'newbie', answered: 2, correct: 2 })]);
    expect(rating?.lowData).toBe(true);
    expect(rating?.accuracyRank).toBeNull();
    expect(rating?.accuracy).toBe(1);
  });

  it('форматирует проценты', () => {
    expect(formatAccuracy(0.6667)).toBe('67%');
    expect(formatAccuracy(null)).toBe('—');
  });
});

describe('buildRatings', () => {
  it('считает все три ранга сразу', () => {
    const rows = [
      row({ profileId: 'a', position: 40, points: 100, answered: 40, correct: 30 }),
      row({ profileId: 'b', position: 60, points: 40, answered: 40, correct: 20 }),
    ];
    const ratings = buildRatings(rows);
    const a = ratings.find((r) => r.profileId === 'a');
    const b = ratings.find((r) => r.profileId === 'b');
    expect(a?.distanceRank).toBe(2);
    expect(b?.distanceRank).toBe(1);
    expect(a?.pointsRank).toBe(1);
    expect(b?.pointsRank).toBe(2);
    expect(a?.accuracyRank).toBe(1);
    expect(b?.accuracyRank).toBe(2);
  });
});
