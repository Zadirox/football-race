'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getViewer } from '@/lib/auth/session';
import { hasDatabase } from '@/lib/env';
import { AppError, isAppError } from '@/lib/errors';
import { removeLineupSlot, upsertLineupSlot } from '@/lib/repo/lineups';
import { loadSeasonSnapshot } from '@/lib/repo/season';

const lineupSlotSchema = z.object({
  matchId: z.string().uuid(),
  slot: z.enum(['GK', 'OF1', 'OF2']),
  cardInstanceId: z.string().uuid(),
});

const removeSlotSchema = z.object({
  matchId: z.string().uuid(),
  slot: z.enum(['GK', 'OF1', 'OF2']),
});

export type LineupActionResult = { ok: boolean; message: string };

function invalidInput(error: unknown): LineupActionResult | null {
  if (typeof error !== 'object' || error === null || !('issues' in error)) return null;
  const issues = (error as { issues: Array<{ path: Array<string | number>; message: string }> }).issues;
  const first = issues[0];
  return { ok: false, message: `Проверь данные: ${first?.message ?? 'некорректный ввод'}` };
}

export async function saveLineupSlotAction(input: unknown): Promise<LineupActionResult> {
  if (!hasDatabase()) return { ok: false, message: 'Демо-режим: база не подключена' };

  try {
    const viewer = await getViewer();
    if (!viewer) throw new AppError('AUTH_REQUIRED');

    const parsed = lineupSlotSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error) ?? { ok: false, message: 'Проверь данные' };

    const snapshot = await loadSeasonSnapshot();
    const seasonId = snapshot.season?.id;
    if (!seasonId) throw new AppError('CONFIG_MISSING', 'Нет активного сезона');

    await upsertLineupSlot({ ...parsed.data, profileId: viewer.profileId, seasonId });
    revalidatePath('/lineups');
    revalidatePath('/collection');
    return { ok: true, message: 'Состав сохранён' };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: `${error.code}: ${error.message}` };
    console.error('Не удалось сохранить слот состава:', error);
    return { ok: false, message: (error as Error)?.message ?? 'Не удалось сохранить состав' };
  }
}

export async function removeLineupSlotAction(input: unknown): Promise<LineupActionResult> {
  if (!hasDatabase()) return { ok: false, message: 'Демо-режим: база не подключена' };

  try {
    const viewer = await getViewer();
    if (!viewer) throw new AppError('AUTH_REQUIRED');

    const parsed = removeSlotSchema.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error) ?? { ok: false, message: 'Проверь данные' };

    await removeLineupSlot({ ...parsed.data, profileId: viewer.profileId });
    revalidatePath('/lineups');
    return { ok: true, message: 'Слот очищен' };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: `${error.code}: ${error.message}` };
    console.error('Не удалось очистить слот состава:', error);
    return { ok: false, message: (error as Error)?.message ?? 'Не удалось очистить слот' };
  }
}