'use server';

import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth/session';
import { hasDatabase } from '@/lib/env';
import { AppError, isAppError } from '@/lib/errors';
import { openPackGrant } from '@/lib/repo/cards';
import { loadSeasonSnapshot } from '@/lib/repo/season';

export type OpenPackActionResult =
  | { ok: true; result: Awaited<ReturnType<typeof openPackGrant>> }
  | { ok: false; message: string };

export async function openPackAction(grantId: string): Promise<OpenPackActionResult> {
  if (!hasDatabase()) {
    return { ok: false, message: 'Демо-режим: база не подключена, открыть пак нельзя' };
  }

  try {
    const viewer = await getViewer();
    if (!viewer) throw new AppError('AUTH_REQUIRED');

    const snapshot = await loadSeasonSnapshot();
    if (!snapshot.season?.id) throw new AppError('CONFIG_MISSING', 'Нет активного сезона');

    const result = await openPackGrant({
      grantId,
      profileId: viewer.profileId,
      seasonId: snapshot.season.id,
    });

    revalidatePath('/collection');
    revalidatePath('/lineups');
    return { ok: true, result };
  } catch (error) {
    if (isAppError(error)) {
      return { ok: false, message: `${error.code}: ${error.message}` };
    }
    console.error('Не удалось открыть пак:', error);
    return { ok: false, message: (error as Error)?.message ?? 'Не удалось открыть пак' };
  }
}