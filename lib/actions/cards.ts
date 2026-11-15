'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getViewer } from '@/lib/auth/session';
import { hasDatabase, serverEnv } from '@/lib/env';
import { AppError, isAppError } from '@/lib/errors';
import { countUnopenedPacks, openPackGrant } from '@/lib/repo/cards';

export type OpenPackActionResult =
  | { ok: true; result: Awaited<ReturnType<typeof openPackGrant>> }
  | { ok: false; message: string };

async function getActiveSeasonId(): Promise<string | null> {
  const rows = await db()<{ id: string }[]>`
    select id
      from seasons
     where status = 'active'
     order by starts_on desc
     limit 1
  `;
  return rows[0]?.id ?? null;
}

export async function getUnopenedPacksCountAction(): Promise<number> {
  if (!serverEnv().cardsEnabled) return 0;
  if (!hasDatabase()) return 0;

  try {
    const viewer = await getViewer();
    if (!viewer) return 0;

    const seasonId = await getActiveSeasonId();
    if (!seasonId) return 0;

    return await countUnopenedPacks(viewer.profileId, seasonId);
  } catch {
    return 0;
  }
}

export async function openPackAction(grantId: string): Promise<OpenPackActionResult> {
  if (!serverEnv().cardsEnabled) {
    return { ok: false, message: 'Раздел карточек и паков временно недоступен' };
  }
  if (!hasDatabase()) {
    return { ok: false, message: 'Демо-режим: база не подключена, открыть пак нельзя' };
  }

  try {
    const viewer = await getViewer();
    if (!viewer) throw new AppError('AUTH_REQUIRED');

    const seasonId = await getActiveSeasonId();
    if (!seasonId) throw new AppError('CONFIG_MISSING', 'Нет активного сезона');

    const result = await openPackGrant({
      grantId,
      profileId: viewer.profileId,
      seasonId,
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