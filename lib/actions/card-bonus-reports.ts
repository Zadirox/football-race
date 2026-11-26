'use server';

import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { hasDatabase, serverEnv } from '@/lib/env';
import { getCardBonusReportsStateForProfile, markCardBonusReportsSeen } from '@/lib/repo/card-bonus-reports';
import type { CardBonusReportsStateView } from '@/lib/types';

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

export async function getMyCardBonusReportsStateAction(): Promise<CardBonusReportsStateView> {
  if (!serverEnv().cardsEnabled) return { unseenCount: 0, reports: [] };
  if (!hasDatabase()) return { unseenCount: 0, reports: [] };
  try {
    const viewer = await getViewer();
    if (!viewer) return { unseenCount: 0, reports: [] };
    const seasonId = await getActiveSeasonId();
    if (!seasonId) return { unseenCount: 0, reports: [] };
    return await getCardBonusReportsStateForProfile(viewer.profileId, seasonId);
  } catch {
    return { unseenCount: 0, reports: [] };
  }
}

export async function markMyCardBonusReportsSeenAction(reportIds?: string[]): Promise<{ ok: boolean }> {
  if (!serverEnv().cardsEnabled) return { ok: false };
  if (!hasDatabase()) return { ok: false };
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false };
    const seasonId = await getActiveSeasonId();
    if (!seasonId) return { ok: false };
    await markCardBonusReportsSeen(viewer.profileId, seasonId, reportIds);
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
