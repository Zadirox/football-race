/**
 * Ошибки приложения (docs/01-architecture.md §7).
 * Код — для логов и тестов, message — для человека.
 */

export type AppErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NO_DICE'
  | 'DICE_ALREADY_USED'
  | 'PENDING_ACTION_BLOCKS_ROLL'
  | 'PLAYER_FINISHED'
  | 'ROLL_ALREADY_MOVED'
  | 'EVENT_NOT_CHOOSABLE'
  | 'PLAYER_NOT_IN_SEASON'
  | 'QUESTION_LOCKED'
  | 'MATCHDAY_NOT_READY'
  | 'RECALC_BLOCKED_DICE_SPENT'
  | 'SYNC_QUOTA_EXCEEDED'
  | 'SYNC_PROVIDER_DOWN'
  | 'CONFIG_MISSING'
  | 'CONFLICT_RETRY'
  | 'INVALID_INPUT'
  | 'CONFLICT'
  | 'NOT_FOUND';

const MESSAGES: Record<AppErrorCode, string> = {
  AUTH_REQUIRED: 'Войди в игру, чтобы продолжить',
  FORBIDDEN: 'Это только для участников',
  NO_DICE: 'Кубиков нет. Сделай предикты — и будут',
  DICE_ALREADY_USED: 'Этот кубик уже сыгран',
  PENDING_ACTION_BLOCKS_ROLL: 'Сначала разберись с событием, потом бросай',
  PLAYER_FINISHED: 'Ты уже на финише. Осталось дождаться остальных',
  ROLL_ALREADY_MOVED: 'Этот бросок уже сделан',
  EVENT_NOT_CHOOSABLE: 'Событие уже закрыто',
  PLAYER_NOT_IN_SEASON: 'Тебя нет в списке участников сезона',
  QUESTION_LOCKED: 'Матч начался — приём ответов закрыт',
  MATCHDAY_NOT_READY: 'Игровой день ещё не собран',
  RECALC_BLOCKED_DICE_SPENT: 'Кубики этого дня уже брошены, пересчёт запрещён',
  SYNC_QUOTA_EXCEEDED: 'Квота провайдера на сегодня исчерпана',
  SYNC_PROVIDER_DOWN: 'Провайдер данных не отвечает, показываем сохранённое',
  CONFIG_MISSING: 'Не хватает настроек окружения',
  CONFLICT_RETRY: 'Кто-то успел раньше. Попробуй ещё раз',
  INVALID_INPUT: 'Проверь введённые данные',
  CONFLICT: 'Данные конфликтуют с текущим состоянием',
  NOT_FOUND: 'Не найдено',
};

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
  }

  toJSON() {
    return { ok: false as const, code: this.code, message: this.message };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Ошибка из Postgres `RAISE EXCEPTION` приходит с кодом в DETAIL. */
export function appErrorFromDb(detail: string | undefined): AppError {
  const known = (Object.keys(MESSAGES) as AppErrorCode[]).find((code) => detail?.includes(code));
  return new AppError(known ?? 'CONFLICT_RETRY');
}
