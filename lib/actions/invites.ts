'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getViewer } from '@/lib/auth/session';
import { AppError, isAppError } from '@/lib/errors';
import { hasDatabase } from '@/lib/env';
import {
  acceptInvite as acceptInviteRepo,
  createInvite as createInviteRepo,
  listInvites as listInvitesRepo,
  revokeInvite as revokeInviteRepo,
  type AdminInviteView,
} from '@/lib/repo/invites';

export type { AdminInviteView };

export type InviteActionResult =
  | { ok: true; token?: string; nickname?: string; message?: string }
  | { ok: false; message: string };

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer) throw new AppError('AUTH_REQUIRED');
  if (viewer.role !== 'admin') throw new AppError('FORBIDDEN', 'Только для админа');
  return viewer;
}

export async function createInviteAction(nickname: string): Promise<InviteActionResult> {
  if (!hasDatabase()) return { ok: false, message: 'База не подключена' };
  try {
    await requireAdmin();
    const result = await createInviteRepo(nickname);
    revalidatePath('/admin');
    return { ok: true, token: result.token, nickname: result.nickname };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message };
    console.error('createInviteAction:', error);
    return { ok: false, message: 'Не удалось создать приглашение' };
  }
}

export async function listInvitesAction(): Promise<AdminInviteView[]> {
  try {
    await requireAdmin();
    return await listInvitesRepo();
  } catch {
    return [];
  }
}

export async function revokeInviteAction(inviteId: string): Promise<InviteActionResult> {
  if (!hasDatabase()) return { ok: false, message: 'База не подключена' };
  try {
    await requireAdmin();
    const id = z.string().uuid().parse(inviteId);
    await revokeInviteRepo(id);
    revalidatePath('/admin');
    return { ok: true, message: 'Приглашение отозвано' };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message };
    console.error('revokeInviteAction:', error);
    return { ok: false, message: 'Не удалось отозвать приглашение' };
  }
}

const acceptSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8).max(128),
});

export async function acceptInviteAction(
  _prev: InviteActionResult | null,
  formData: FormData,
): Promise<InviteActionResult> {
  try {
    const parsed = acceptSchema.safeParse({
      token: String(formData.get('token') ?? ''),
      password: String(formData.get('password') ?? ''),
    });
    if (!parsed.success) {
      return { ok: false, message: 'Проверьте данные: пароль не короче 8 символов' };
    }
    const result = await acceptInviteRepo(parsed.data.token, parsed.data.password);
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, nickname: result.nickname, message: 'Аккаунт создан. Теперь войдите по нику и паролю.' };
  } catch (error) {
    console.error('acceptInviteAction:', error);
    return { ok: false, message: 'Не удалось активировать приглашение' };
  }
}
