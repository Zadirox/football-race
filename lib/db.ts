/**
 * Пул к базе Supabase (Postgres).
 *
 * Подключение создаётся лениво: в демо-режиме `DATABASE_URL` нет, и модуль
 * никто не трогает. `prepare: false` обязателен для transaction pooler
 * Supabase (pgbouncer не поддерживает prepared statements).
 */

import postgres from 'postgres';
import { serverEnv } from '@/lib/env';

export type Db = ReturnType<typeof postgres>;

let client: Db | null = null;

/** Клиент БД. Бросает, если `DATABASE_URL` не задан — вызывать только под `hasDatabase()`. */
export function db(): Db {
  const url = serverEnv().databaseUrl;
  if (!url) throw new Error('DATABASE_URL не задан: база не подключена');

  if (!client) {
    client = postgres(url, {
      // В serverless держим мало соединений, чтобы не упираться в лимиты pooler/Supabase.
      max: 2,
      prepare: false,
      idle_timeout: 10,
      max_lifetime: 60 * 5,
      connect_timeout: 10,
      // Не даём запросам зависать бесконечно (иначе страницы/функции упираются в лимит платформы).
      connection: {
        statement_timeout: 30000,
      },
      onnotice: () => {},
    });
  }

  return client;
}

/** Закрыть пул (скрипты, тесты). В приложении не вызывается. */
export async function closeDb(): Promise<void> {
  if (!client) return;
  await client.end({ timeout: 5 });
  client = null;
}
