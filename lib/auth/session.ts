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

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('nickname, role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile) return null;

    return {
      profileId: data.user.id,
      nickname: profile.nickname as string,
      role: profile.role as Role,
    };
  } catch {
    return null;
  }
}
