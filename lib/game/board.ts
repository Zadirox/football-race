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

function hasAdjacentSameMechanic(cells: readonly BoardCell[]): boolean {
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1];
    const cur = cells[i];
    if (prev?.kind === 'event' && cur?.kind === 'event' && prev.mechanicCode && prev.mechanicCode === cur.mechanicCode) {
      return true;
    }
  }
  return false;
}

function assignMechanicsToPositions(
  eventPositions: readonly number[],
  pool: readonly string[],
  random: () => number,
): Map<number, string> | null {
  const remaining = [...pool];
  const byPos = new Map<number, string>();
  const positions = [...eventPositions].sort((a, b) => a - b);

  for (const pos of positions) {
    const prevIsAdjacentEvent = byPos.has(pos - 1);
    const prevCode = prevIsAdjacentEvent ? byPos.get(pos - 1) : null;
    const candidates = remaining
      .map((code, i) => ({ code, i }))
      .filter(({ code }) => code !== prevCode);

    const pickFrom = candidates.length > 0 ? candidates : remaining.map((code, i) => ({ code, i }));
    const pick = pickFrom[Math.floor(random() * pickFrom.length)];
    if (!pick) return null;
    byPos.set(pos, pick.code);
    remaining.splice(pick.i, 1);
  }

  return byPos;
}

function hasGoodEarlyRhythm(cells: readonly BoardCell[], safeStart: number): boolean {
  const earlyWindowEnd = Math.min(13, cells.length - 1);
  let eventsEarly = 0;
  for (let idx = safeStart + 1; idx <= earlyWindowEnd; idx++) {
    if (cells[idx - 1]?.kind === 'event') eventsEarly += 1;
  }
  // После безопасного старта путь не должен быть «пустыней» из одних plain.
  if (eventsEarly < 3) return false;

  let eventsFirst20 = 0;
  let plainRun = 0;
  let maxPlainRunFirst20 = 0;
  for (let i = 0; i < Math.min(20, cells.length); i++) {
    const cell = cells[i];
    if (cell?.kind === 'event') {
      eventsFirst20 += 1;
      plainRun = 0;
    } else {
      // старт/обычная — считаем серию «не-событий» после safeStart
      if (i >= safeStart) {
        plainRun += 1;
        if (plainRun > maxPlainRunFirst20) maxPlainRunFirst20 = plainRun;
      }
    }
  }
  if (eventsFirst20 < 5) return false;
  if (maxPlainRunFirst20 > 4) return false;
  return true;
}

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
    const eventPositions = shuffle(shuffledSlots.slice(0, eventCells), random).sort((a, b) => a - b);
    const eventPositionSet = new Set(eventPositions);

    const pool = expandWeights(config.weights, eventCells);
    const assignment = assignMechanicsToPositions(eventPositions, pool, random);
    if (!assignment) continue;

    const cells: BoardCell[] = [];
    for (let idx = 1; idx <= totalCells; idx++) {
      if (idx === 1) {
        cells.push({ idx, kind: 'start', mechanicCode: null });
      } else if (idx === totalCells) {
        cells.push({ idx, kind: 'finish', mechanicCode: null });
      } else if (eventPositionSet.has(idx)) {
        cells.push({ idx, kind: 'event', mechanicCode: assignment.get(idx) ?? null });
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

    if (firstHalfCodes.size < minDistinctFirstHalf) continue;
    if (hasAdjacentSameMechanic(cells)) continue;
    if (!hasGoodEarlyRhythm(cells, safeStart)) continue;

    return { seed: attemptSeed, cells };
  }

  throw new BoardLayoutError(
    'BOARD_LAYOUT_UNSATISFIABLE: не удалось разложить карту с заданными ограничениями',
  );
}

/**
 * Переработанная раскладка сезона (задача 5, усиленный баланс 1–40):
 * - 1–40: все рабочие механики 01–10 + 2 клетки «Пак на выбор» (14, 26), больше негатива/риска
 * - 41–80: задел под новые механики (пока «Скоро») + 2 клетки «Пак на выбор» (48, 62)
 * - плавный старт (первые несколько клеток без событий), без соседних одинаковых
 * - баффы (05,06,10) не идут подряд, жёлтая (08) не ставится прямо перед баффом
 * - Раздевалка (07) стоит после Жёлтой (08), чтобы её можно было снять до усиления
 */
export function generateReworkedBoard(): GenerateBoardResult {
  const map = new Map<number, string>([
    [5, '04'],   // Скользкий газон (-, -1 к след. броску)
    [7, '02'],   // Офсайд (-)
    [9, '08'],   // Жёлтая карточка (-, висит до усиления/снятия)
    [11, '07'],  // Раздевалка — после 08, можно снять жёлтую
    [13, '03'],  // Голевая передача (выбор)
    [14, '19'],  // Пак на выбор
    [16, '05'],  // Домашние трибуны (бафф)
    [18, '02'],  // Офсайд (-)
    [20, '04'],  // Скользкий газон (-)
    [22, '09'],  // VAR (риск)
    [24, '08'],  // Жёлтая карточка (-)
    [26, '19'],  // Пак на выбор
    [28, '07'],  // Раздевалка — после 08, можно снять жёлтую
    [30, '06'],  // Щитки (бафф/защита)
    [32, '04'],  // Скользкий газон (-)
    [34, '02'],  // Офсайд (-)
    [36, '10'],  // Тактическая схема (бафф)
    [38, '09'],  // VAR (риск)
    [40, '01'],  // Контратака (+)

    [42, '20'],  // Скоро: новая механика
    [44, '20'],
    [46, '20'],
    [48, '19'],  // Пак на выбор
    [50, '20'],
    [52, '20'],
    [54, '20'],
    [56, '20'],
    [58, '20'],
    [60, '20'],
    [62, '19'],  // Пак на выбор
    [64, '20'],
    [66, '20'],
    [68, '20'],
    [70, '20'],
    [72, '20'],
    [74, '20'],
    [76, '20'],
    [78, '20'],
  ]);

  const cells: BoardCell[] = [];
  for (let idx = 1; idx <= 80; idx++) {
    if (idx === 1) {
      cells.push({ idx, kind: 'start', mechanicCode: null });
    } else if (idx === 80) {
      cells.push({ idx, kind: 'finish', mechanicCode: null });
    } else {
      const code = map.get(idx) ?? null;
      cells.push({ idx, kind: code ? 'event' : 'plain', mechanicCode: code });
    }
  }

  return { seed: 202603, cells };
}
