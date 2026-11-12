'use server';

/**
 * Вход и выход (Supabase Auth, cookie-сессия).
 *
 * Пароли живут только в Supabase; сайт их не хранит. В демо-режиме
 * (нет пары URL + anon-ключ) форма честно говорит, что вход ещё не подключён.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { syntheticEmailForNickname } from '@/lib/auth/invite';
import { serverEnv } from '@/lib/env';

export type AuthResult = { ok: true } | { ok: false; message: string };

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function signInAction(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const login = String(formData.get('login') ?? formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!login || password.length === 0) {
    return { ok: false, message: 'Заполни ник (или почту) и пароль' };
  }

  const env = serverEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return {
      ok: false,
      message: 'Демо-режим: вход включится вместе с Supabase Auth. Сейчас играй как Шах — админ сезона.',
    };
  }

  // По нику вход через служебный email (инвайт-регистрация); по email — как раньше (админ).
  const email = login.includes('@') ? login : syntheticEmailForNickname(login);

  const store = await cookies();
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items: CookieToSet[]) => {
        for (const item of items) store.set(item.name, item.value, item.options);
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Текст ошибки Supabase в UI не отдаём: он различает «нет пользователя»
    // и «неверный пароль», а это лишняя подсказка для подбора.
    console.error('Вход не удался:', error.message);
    return { ok: false, message: 'Неверный ник/почта или пароль' };
  }

  redirect('/');
}

export async function signOutAction(): Promise<void> {
  const env = serverEnv();

  if (env.supabaseUrl && env.supabaseAnonKey) {
    const store = await cookies();
    const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (items: CookieToSet[]) => {
          try {
            for (const item of items) store.set(item.name, item.value, item.options);
          } catch {
            // Выход всё равно чистит cookie ниже.
          }
        },
      },
    });
    await supabase.auth.signOut();
  }

  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (cookie.name.startsWith('sb-')) store.delete(cookie.name);
  }

  redirect('/login');
}
