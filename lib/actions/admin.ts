'use server';

/**
 * Ручные действия админки: синк расписания, закрытие дня и авто-закрытие
 * брошенных ожиданий. Те же функции, что дёргает cron, но с проверкой
 * роли: админ не должен носить `CRON_SECRET` в браузере.
 *
 * В демо-режиме возвращается `CONFIG_MISSING` — без базы прогонять нечего.
 */

import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth/session';
import { hasDatabase } from '@/lib/env';
import { AppError, isAppError } from '@/lib/errors';
import { expirePending } from '@/lib/repo/pending';
import { advanceMatchdays, syncFixtures } from '@/lib/repo/sync';

export type AdminRunResult = {
  ok: boolean;
  message: string;
};

function demoOnly(): AdminRunResult {
  return { ok: false, message: 'Демо-режим: база не подключена, прогон недоступен' };
}

function toResult(error: unknown): AdminRunResult {
  if (isAppError(error)) {
    return { ok: false, message: `${error.code}: ${error.message}` };
  }
  console.error('Админское действие не выполнено:', error);
  return { ok: false, message: (error as Error)?.message ?? 'Не получилось' };
}

async function requireAdmin(): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) throw new AppError('AUTH_REQUIRED');
  if (viewer.role !== 'admin') throw new AppError('FORBIDDEN', 'Только админ сезона');
}

function revalidateAdmin(): void {
  revalidatePath('/', 'layout');
  revalidatePath('/admin');
}

/** Синк фикстур: один запрос к провайдеру на прогон. */
export async function runSyncAction(): Promise<AdminRunResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    await requireAdmin();
    const report = await syncFixtures();
    revalidateAdmin();

    if (report.reason) {
      return {
        ok: false,
        message: `Синк не выполнен: ${report.reason}${report.error ? ` (${report.error})` : ''}`,
      };
    }

    return {
      ok: true,
      message: `Синк: получено ${report.fetched}, в игре ${report.kept}, сохранено матчей ${report.matches}, дней ${report.matchdays} за ${report.durationMs} мс`,
    };
  } catch (error) {
    return toResult(error);
  }
}

/** Переходы статусов дня и авто-резолв завершённых дней. */
export async function runAdvanceAction(): Promise<AdminRunResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    await requireAdmin();
    const report = await advanceMatchdays();
    revalidateAdmin();

    const message = `Дни: проверено ${report.checked}, изменено ${report.changed}, закрыто ${report.resolved}`;
    return report.ok
      ? { ok: true, message }
      : { ok: false, message: `${message}. Ошибки: ${report.errors.join('; ')}` };
  } catch (error) {
    return toResult(error);
  }
}

/** Закрывает просроченные ожидания безопасными ветками (D7). */
export async function runExpireAction(): Promise<AdminRunResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    await requireAdmin();
    const report = await expirePending();
    revalidateAdmin();

    const message = `Ожидания: проверено ${report.checked}, закрыто ${report.expired}, пропущено ${report.skipped}`;
    return report.ok
      ? { ok: true, message }
      : { ok: false, message: `${message}. Ошибки: ${report.errors.join('; ')}` };
  } catch (error) {
    return toResult(error);
  }
}
