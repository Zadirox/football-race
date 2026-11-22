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
      // Supavisor session mode has tight pool_size; release slots fast in serverless.
      max: 1,
      prepare: false,
      idle_timeout: 2,
      max_lifetime: 15,
      connect_timeout: 5,
      keep_alive: 30,
      // Не даём запросам зависать бесконечно; keepalive помогает быстрее обнаружить мёртвого клиента.
      connection: {
        statement_timeout: 30000,
        idle_in_transaction_session_timeout: 30000,
      },
      onnotice: () => {},
    });
  }

  return client;
}

/** Закрыть пул (скрипты, тесты, cron). Всегда сбрасываем client, чтобы мёртвое соединение не переиспользовалось. */
export async function closeDb(): Promise<void> {
  const c = client;
  client = null;
  if (!c) return;
  await c.end({ timeout: 5 }).catch(() => {});
}
