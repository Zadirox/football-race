'use server';

/**
 * Ручные действия админки: синк расписания, закрытие дня и авто-закрытие
 * брошенных ожиданий. Те же функции, что дёргает cron, но с проверкой
 * роли: админ не должен носить `CRON_SECRET` в браузере.
 *
 * В демо-режиме возвращается `CONFIG_MISSING` — без базы прогонять нечего.
 */

import { revalidatePath } from 'next/cache';
import {
  diceGrantSchema,
  lineupBonusManualSchema,
  matchUpdateSchema,
  packGrantSchema,
  pendingCloseSchema,
  roleChangeSchema,
  syncFixturesSchema,
} from '@/lib/actions/admin-schemas';
import { getViewer, type Viewer } from '@/lib/auth/session';
import { hasDatabase } from '@/lib/env';
import { AppError, isAppError } from '@/lib/errors';
import {
  awardManualLineupBonus,
  forceClosePending,
  grantDice,
  grantPackToProfile,
  setRole,
  updateMatch,
} from '@/lib/repo/admin-tools';
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

async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AppError('AUTH_REQUIRED');
  if (viewer.role !== 'admin') throw new AppError('FORBIDDEN', 'Только админ сезона');
  return viewer;
}

function invalidInput(error: unknown): AdminRunResult | null {
  if (typeof error !== 'object' || error === null || !('issues' in error)) return null;
  const issues = (error as { issues: Array<{ path: Array<string | number>; message: string }> }).issues;
  const first = issues[0];
  const field = first?.path.length ? `${first.path.join('.')}: ` : '';
  return { ok: false, message: `Проверь поля — ${field}${first?.message ?? 'некорректные данные'}` };
}

function revalidateAdmin(): void {
  revalidatePath('/', 'layout');
  revalidatePath('/admin');
}

/** Синк фикстур: обычное окно или разовый период, если указаны даты. */
export async function runSyncAction(input?: unknown): Promise<AdminRunResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    await requireAdmin();
    const parsed = syncFixturesSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error) ?? { ok: false, message: 'Проверь даты периода' };

    const window =
      parsed.data?.from && parsed.data?.to ? { from: parsed.data.from, to: parsed.data.to } : undefined;
    const report = await syncFixtures(window ? { window } : undefined);
    revalidateAdmin();

    if (report.reason) {
      return {
        ok: false,
        message: `Синк не выполнен: ${report.reason}${report.error ? ` (${report.error})` : ''}`,
      };
    }

    const period = window ? ` за ${window.from}–${window.to}` : '';
    return {
      ok: true,
      message: `Синк${period}: получено ${report.fetched}, в игре ${report.kept}, сохранено матчей ${report.matches}, дней ${report.matchdays}, вопросов ${report.questions} за ${report.durationMs} мс`,
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

/** Правка счёта, статуса и минуты матча. */
export async function updateMatchAction(input: unknown): Promise<AdminRunResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireAdmin();
    const parsed = matchUpdateSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error) ?? { ok: false, message: 'Проверь поля' };

    await updateMatch(viewer.profileId, parsed.data);
    revalidateAdmin();
    return { ok: true, message: `Матч обновлён: ${parsed.data.status}` };
  } catch (error) {
    return toResult(error);
  }
}

/** Ручная выдача кубиков: бонус, компенсация, подарок. */
export async function grantDiceAction(input: unknown): Promise<AdminRunResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireAdmin();
    const parsed = diceGrantSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error) ?? { ok: false, message: 'Проверь поля' };

    await grantDice(viewer.profileId, parsed.data);
    revalidateAdmin();
    return { ok: true, message: `Выдано кубиков: ${parsed.data.count} (${parsed.data.tier})` };
  } catch (error) {
    return toResult(error);
  }
}

/** Закрыть застрявшее ожидание, не дожидаясь авто-закрытия. */
export async function forceClosePendingAction(input: unknown): Promise<AdminRunResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireAdmin();
    const parsed = pendingCloseSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error) ?? { ok: false, message: 'Проверь поля' };

    await forceClosePending(viewer.profileId, parsed.data);
    revalidateAdmin();
    return { ok: true, message: 'Ожидание закрыто безопасной веткой' };
  } catch (error) {
    return toResult(error);
  }
}

/** Смена роли: игрок ↔ зритель ↔ админ. */
export async function changeRoleAction(input: unknown): Promise<AdminRunResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireAdmin();
    const parsed = roleChangeSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error) ?? { ok: false, message: 'Проверь поля' };

    await setRole(viewer.profileId, parsed.data);
    revalidateAdmin();
    return { ok: true, message: `Роль изменена: ${parsed.data.role}` };
  } catch (error) {
    return toResult(error);
  }
}

/** Ручная выдача паков сборных активного сезона. */
export async function grantPackAction(input: unknown): Promise<AdminRunResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireAdmin();
    const parsed = packGrantSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error) ?? { ok: false, message: 'Проверь поля' };

    await grantPackToProfile(viewer.profileId, parsed.data);
    revalidateAdmin();
    const n = parsed.data.count;
    return { ok: true, message: `Выдано паков сборных: ${n}` };
  } catch (error) {
    return toResult(error);
  }
}

/** Ручной бонус состава: засчитать/снять для FWD/MID/GK после FT. */
export async function awardLineupBonusAction(input: unknown): Promise<AdminRunResult> {
  if (!hasDatabase()) return demoOnly();

  try {
    const viewer = await requireAdmin();
    const parsed = lineupBonusManualSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error) ?? { ok: false, message: 'Проверь поля' };

    await awardManualLineupBonus(viewer.profileId, parsed.data);
    revalidateAdmin();
    return {
      ok: true,
      message: parsed.data.triggered ? 'Бонус состава засчитан' : 'Бонус состава снят',
    };
  } catch (error) {
    return toResult(error);
  }
}
