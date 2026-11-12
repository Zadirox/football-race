/**
 * Безопасное создание первого администратора (без общего пароля для участников).
 *
 * Запуск: `npm run bootstrap:admin`
 *
 * Нужны:
 * - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (создание/обновление auth-пользователя)
 * - DATABASE_URL или SUPABASE_DB_URL (запись профиля)
 * - BOOTSTRAP_ADMIN_EMAIL
 * - BOOTSTRAP_ADMIN_PASSWORD (не короче 12 символов; не выводится)
 * - BOOTSTRAP_ADMIN_NICKNAME (опционально, 2–24 символа)
 *
 * Идемпотентно для того же email: профиль повышается до admin.
 * Пароль обновляется только если BOOTSTRAP_ADMIN_SET_PASSWORD=1 (по умолчанию
 * существующий пароль не трогаем, чтобы случайно не перезаписать).
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const key = match[1] as string;
      if (process.env[key]) continue;
      let value = (match[2] as string).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function read(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

function requireEnv(name: string): string {
  const value = read(name);
  if (!value) throw new Error(`Не задана переменная ${name}.`);
  return value;
}

async function main(): Promise<void> {
  loadEnvFiles();

  const databaseUrl = read('DATABASE_URL') ?? read('SUPABASE_DB_URL');
  if (!databaseUrl) throw new Error('Не задан DATABASE_URL (или SUPABASE_DB_URL).');
  const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const email = requireEnv('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const password = requireEnv('BOOTSTRAP_ADMIN_PASSWORD');
  const nickname = read('BOOTSTRAP_ADMIN_NICKNAME') ?? 'Админ';
  const forceSetPassword = read('BOOTSTRAP_ADMIN_SET_PASSWORD') === '1';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL выглядит некорректно.');
  }
  if (password.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD должен быть не короче 12 символов.');
  }
  if (nickname.length < 2 || nickname.length > 24) {
    throw new Error('BOOTSTRAP_ADMIN_NICKNAME должен быть длиной 2–24 символа.');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listError) throw new Error(`Не удалось прочитать пользователей: ${listError.message}`);

  let userId = listed.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nickname },
    });
    if (error || !data.user) {
      throw new Error(`Не удалось создать администратора: ${error?.message ?? 'нет пользователя'}`);
    }
    userId = data.user.id;
    console.log('Создан auth-пользователь администратора.');
  } else {
    console.log('Auth-пользователь с таким email уже существует.');
    if (forceSetPassword) {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { nickname },
      });
      if (error) throw new Error(`Не удалось обновить пароль администратора: ${error.message}`);
      console.log('Пароль администратора обновлён (BOOTSTRAP_ADMIN_SET_PASSWORD=1).');
    } else {
      console.log('Пароль существующего пользователя не менялся (задайте BOOTSTRAP_ADMIN_SET_PASSWORD=1, если нужно).');
    }
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`
      insert into profiles (id, nickname, role)
      values (${userId}, ${nickname}, 'admin'::user_role)
      on conflict (id) do update
        set nickname = excluded.nickname,
            role = 'admin'::user_role
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(`Готово: профиль администратора активен (${email}, ник: ${nickname}).`);
  console.log('Секреты не выводились. Общие пароли участникам не создавались.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
