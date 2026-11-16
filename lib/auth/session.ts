/**
 * Зритель текущей сессии (Supabase Auth, cookie-based).
 *
 * В демо-режиме (нет `SUPABASE_URL` / anon-ключа) возвращает `null`:
 * экраны играют демо-снимком, где «я» уже задан.
 * В боевом режиме профиль читается из `profiles` (RLS разрешает select всем).
 */

import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { serverEnv } from '@/lib/env';
import type { Role } from '@/lib/types';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export type Viewer = {
  profileId: string;
  nickname: string;
  role: Role;
};

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getViewer(): Promise<Viewer | null> {
  const env = serverEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;

  try {
    const store = await cookies();
    const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (items: CookieToSet[]) => {
          try {
            for (const item of items) {
              store.set(item.name, item.value, item.options);
            }
          } catch {
            // Server Component не может писать cookie — обновление сессии
            // делает middleware. Чтение от этого не страдает.
          }
        },
      },
    });

    const authResult = await withTimeout(supabase.auth.getUser(), 5000);
    if (!authResult || authResult.error || !authResult.data.user) return null;

    const profileResult = await withTimeout(
      Promise.resolve(
        supabase
          .from('profiles')
          .select('nickname, role')
          .eq('id', authResult.data.user.id)
          .maybeSingle(),
      ),
      5000,
    );
    const profile = profileResult?.data as { nickname: string; role: Role } | null | undefined;
    if (!profileResult || profileResult.error || !profile) return null;

    return {
      profileId: authResult.data.user.id,
      nickname: profile.nickname,
      role: profile.role,
    };
  } catch {
    return null;
  }
}
