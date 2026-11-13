'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { hasDatabase } from '@/lib/env';
import { favoritesExist } from '@/lib/repo/reference-data';
import { invalidateSeasonSnapshotCache } from '@/lib/repo/season';

export type FavoritesActionResult = { ok: true; message?: string } | { ok: false; message: string };

const schema = z.object({
  favoriteNationalTeamId: z.string().uuid(),
  favoriteClubId: z.string().uuid(),
  favoritePlayerId: z.string().uuid(),
});

export async function updateMyFavoritesAction(
  _prev: FavoritesActionResult | null,
  formData: FormData,
): Promise<FavoritesActionResult> {
  if (!hasDatabase()) return { ok: false, message: 'База не подключена' };
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, message: 'Нужно войти' };

    const parsed = schema.safeParse({
      favoriteNationalTeamId: String(formData.get('favoriteNationalTeamId') ?? ''),
      favoriteClubId: String(formData.get('favoriteClubId') ?? ''),
      favoritePlayerId: String(formData.get('favoritePlayerId') ?? ''),
    });
    if (!parsed.success) {
      return { ok: false, message: 'Выберите любимую сборную, клуб и игрока' };
    }

    const ok = await favoritesExist(parsed.data);
    if (!ok) return { ok: false, message: 'Выбранные клуб, сборная или игрок не найдены' };

    const sql = db();
    await sql`
      update profiles
      set
        favorite_national_team_id = ${parsed.data.favoriteNationalTeamId}::uuid,
        favorite_club_id = ${parsed.data.favoriteClubId}::uuid,
        favorite_player_id = ${parsed.data.favoritePlayerId}::uuid
      where id = ${viewer.profileId}::uuid
    `;

    invalidateSeasonSnapshotCache(viewer.profileId);
    revalidatePath('/participants');
    revalidatePath('/');

    return { ok: true, message: 'Любимые сохранены' };
  } catch (error) {
    console.error('updateMyFavoritesAction:', error);
    return { ok: false, message: 'Не удалось сохранить любимые' };
  }
}
