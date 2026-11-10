/**
 * Обновление cookie-сессии Supabase на каждом запросе.
 *
 * Server Components читать cookie могут, а писать — нет, поэтому продление
 * токена делает middleware. Без ключей middleware пропускает запрос как есть:
 * демо-режим не должен зависеть от Supabase.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const env = serverEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items: CookieToSet[]) => {
        for (const item of items) request.cookies.set(item.name, item.value);
        response = NextResponse.next({ request });
        for (const item of items) response.cookies.set(item.name, item.value, item.options);
      },
    },
  });

  // Обновляет токен, если он истёк; ошибку намеренно не пробрасываем,
  // иначе любая проблема с сетью ломала бы весь сайт.
  await supabase.auth.getUser();

  return response;
}
