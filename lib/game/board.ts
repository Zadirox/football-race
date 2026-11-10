/**
 * Раскладка карты (docs/04-mechanics.md, раздел 2, и DECISIONS D12).
 *
 * 80 клеток: 1 — старт, 80 — финиш, 40 событийных, 40 обычных
 * (старт и финиш считаются обычными — у них нет эффекта).
 * Раскладка детерминирована сидом и воспроизводима на любом окружении.
 */

export type CellKind = 'start' | 'plain' | 'event' | 'finish';

export type BoardCell = {
  idx: number;
  kind: CellKind;
  mechanicCode: string | null;
};

export type BoardConfig = {
  totalCells: number;
  eventCells: number;
  /** Сколько первых клеток гарантированно без событий (включая старт). */
  safeStart: number;
  /** Сколько разных механик должно встретиться в первой половине. */
  minDistinctFirstHalf: number;
  maxAttempts: number;
  weights: Record<string, number>;
};

export const DEFAULT_WEIGHTS: Record<string, number> = {
  '01': 4, // Контратака
  '02': 4, // Офсайд
  '03': 3, // Голевая передача
  '04': 4, // Скользкий газон
  '05': 3, // Домашние трибуны
  '06': 3, // Щитки
  '07': 3, // Раздевалка
  '08': 3, // Жёлтая карточка
  '09': 2, // VAR
  '10': 3, // Тактическая схема
};

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  totalCells: 80,
  eventCells: 40,
  safeStart: 5,
  minDistinctFirstHalf: 8,
  maxAttempts: 1000,
  weights: DEFAULT_WEIGHTS,
};

export class BoardLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoardLayoutError';
  }
}

/** Детерминированный ГПСЧ (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/**
 * Разворачивает веса ровно в `total` элементов методом наибольших остатков.
 * Сумма весов не обязана совпадать с total.
 */
export function expandWeights(weights: Record<string, number>, total: number): string[] {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  if (entries.length === 0 || total <= 0) return [];

  const sum = entries.reduce((acc, [, w]) => acc + w, 0);
  const exact = entries.map(([code, w]) => ({ code, quota: (w * total) / sum }));
  const floors = exact.map((e) => ({ code: e.code, count: Math.floor(e.quota), rem: e.quota % 1 }));

  let assigned = floors.reduce((acc, f) => acc + f.count, 0);
  const byRemainder = [...floors].sort((a, b) => b.rem - a.rem || a.code.localeCompare(b.code));

  let i = 0;
  while (assigned < total && byRemainder.length > 0) {
    const target = byRemainder[i % byRemainder.length] as { code: string; count: number; rem: number };
    target.count += 1;
    assigned += 1;
    i += 1;
  }

  // Каждая механика с ненулевым весом должна встретиться хотя бы раз.
  for (const floor of floors) {
    if (floor.count === 0) {
      const donor = floors
        .filter((f) => f.count > 1)
        .sort((a, b) => b.count - a.count)[0];
      if (donor) {
        donor.count -= 1;
        floor.count = 1;
      }
    }
  }

  return floors.flatMap((f) => Array.from({ length: f.count }, () => f.code));
}

export type GenerateBoardResult = {
  seed: number;
  cells: BoardCell[];
};

export function generateBoard(
  seed: number,
  overrides: Partial<BoardConfig> = {},
): GenerateBoardResult {
  const config: BoardConfig = { ...DEFAULT_BOARD_CONFIG, ...overrides };
  const { totalCells, eventCells, safeStart, minDistinctFirstHalf, maxAttempts } = config;

  const firstEventSlot = safeStart + 1; // 1-based индекс первой клетки, где может быть событие
  const lastEventSlot = totalCells - 1; // финиш всегда обычный
  const slots: number[] = [];
  for (let idx = firstEventSlot; idx <= lastEventSlot; idx++) slots.push(idx);

  if (eventCells > slots.length) {
    throw new BoardLayoutError(
      `Нельзя разместить ${eventCells} событий в ${slots.length} свободных клетках`,
    );
  }
  if (safeStart < 1) throw new BoardLayoutError('safeStart должен быть >= 1');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptSeed = seed + attempt;
    const random = mulberry32(attemptSeed);

    const shuffledSlots = shuffle(slots, random);
    const eventPositions = new Set(shuffledSlots.slice(0, eventCells));

    const pool = shuffle(expandWeights(config.weights, eventCells), random);

    const cells: BoardCell[] = [];
    let poolIndex = 0;
    for (let idx = 1; idx <= totalCells; idx++) {
      if (idx === 1) {
        cells.push({ idx, kind: 'start', mechanicCode: null });
      } else if (idx === totalCells) {
        cells.push({ idx, kind: 'finish', mechanicCode: null });
      } else if (eventPositions.has(idx)) {
        cells.push({ idx, kind: 'event', mechanicCode: pool[poolIndex++] ?? null });
      } else {
        cells.push({ idx, kind: 'plain', mechanicCode: null });
      }
    }

    const firstHalfCodes = new Set(
      cells
        .slice(0, Math.floor(totalCells / 2))
        .filter((c) => c.kind === 'event')
        .map((c) => c.mechanicCode),
    );

    if (firstHalfCodes.size >= minDistinctFirstHalf) {
      return { seed: attemptSeed, cells };
    }
  }

  throw new BoardLayoutError(
    'BOARD_LAYOUT_UNSATISFIABLE: не удалось разложить карту с заданными ограничениями',
  );
}
