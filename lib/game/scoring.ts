/**
 * Три рейтинга (docs/05 §2.4): дистанция, очки, точность.
 * Чистые функции — одна и та же сортировка на сервере и в тестах.
 */

export type RatingInput = {
  profileId: string;
  nickname: string;
  avatarUrl?: string | null;
  /** Текущая клетка, 1..80. */
  position: number;
  /** Когда игрок дошёл до 80 — для тай-брейка по дистанции. */
  finishedAt?: string | null;
  points: number;
  answered: number;
  correct: number;
};

export type RatingRow = RatingInput & {
  distanceRank: number;
  pointsRank: number;
  accuracyRank: number | null;
  /** Точность 0..1, null если ответов нет. */
  accuracy: number | null;
  /** Меньше порога ответов — «мало данных». */
  lowData: boolean;
};

/** Меньше 30 ответов за сезон — серая строка внизу таблицы. */
export const MIN_ANSWERS_FOR_ACCURACY = 30;

export function accuracyOf(row: Pick<RatingInput, 'answered' | 'correct'>): number | null {
  if (row.answered <= 0) return null;
  return row.correct / row.answered;
}

/** Дистанция: позиция, затем кто раньше финишировал, затем очки. */
export function sortByDistance<T extends RatingInput>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.position !== a.position) return b.position - a.position;
    const aFinished = a.finishedAt ? Date.parse(a.finishedAt) : Number.POSITIVE_INFINITY;
    const bFinished = b.finishedAt ? Date.parse(b.finishedAt) : Number.POSITIVE_INFINITY;
    if (aFinished !== bFinished) return aFinished - bFinished;
    if (b.points !== a.points) return b.points - a.points;
    return a.nickname.localeCompare(b.nickname, 'ru');
  });
}

/** Очки: сумма score_events, затем дистанция. */
export function sortByPoints<T extends RatingInput>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.position !== a.position) return b.position - a.position;
    return a.nickname.localeCompare(b.nickname, 'ru');
  });
}

/**
 * Точность: только игроки с достаточной выборкой, по убыванию.
 * Игроки с малой выборкой — в конце, помечены `lowData`.
 */
export function sortByAccuracy<T extends RatingInput>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const aLow = a.answered < MIN_ANSWERS_FOR_ACCURACY;
    const bLow = b.answered < MIN_ANSWERS_FOR_ACCURACY;
    if (aLow !== bLow) return aLow ? 1 : -1;
    const aAcc = accuracyOf(a) ?? -1;
    const bAcc = accuracyOf(b) ?? -1;
    if (bAcc !== aAcc) return bAcc - aAcc;
    if (b.answered !== a.answered) return b.answered - a.answered;
    return a.nickname.localeCompare(b.nickname, 'ru');
  });
}

export function buildRatings(rows: readonly RatingInput[]): RatingRow[] {
  const byDistance = sortByDistance(rows);
  const byPoints = sortByPoints(rows);
  const byAccuracy = sortByAccuracy(rows);

  return byDistance.map((row) => {
    const pointsRank = byPoints.findIndex((r) => r.profileId === row.profileId) + 1;
    const accuracyIndex = byAccuracy.findIndex((r) => r.profileId === row.profileId);
    const lowData = row.answered < MIN_ANSWERS_FOR_ACCURACY;
    return {
      ...row,
      distanceRank: byDistance.findIndex((r) => r.profileId === row.profileId) + 1,
      pointsRank,
      accuracyRank: lowData ? null : accuracyIndex + 1,
      accuracy: accuracyOf(row),
      lowData,
    };
  });
}

/** Проценты для UI: 0.6667 → «67%». */
export function formatAccuracy(value: number | null): string {
  if (value === null) return '—';
  return `${Math.round(value * 100)}%`;
}
