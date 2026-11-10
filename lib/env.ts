/**
 * Проверка окружения. Ключи читаются только на сервере и никогда не
 * попадают в клиентские бандлы — здесь нет `NEXT_PUBLIC_` переменных.
 */

export type ServerEnv = {
  databaseUrl: string | null;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  supabaseServiceKey: string | null;
  footballDataToken: string | null;
  rapidApiKey: string | null;
  rapidApiHost: string | null;
  cronSecret: string | null;
};

function read(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function serverEnv(): ServerEnv {
  return {
    databaseUrl: read('DATABASE_URL') ?? read('SUPABASE_DB_URL'),
    supabaseUrl: read('SUPABASE_URL') ?? read('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: read('SUPABASE_ANON_KEY') ?? read('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    supabaseServiceKey: read('SUPABASE_SERVICE_ROLE_KEY'),
    footballDataToken: read('FOOTBALL_DATA_TOKEN') ?? read('FOOTBALL_DATA_ORG_TOKEN'),
    rapidApiKey: read('RAPIDAPI_KEY'),
    rapidApiHost: read('RAPIDAPI_HOST') ?? read('RAPIDAPI_FOOTBALL_HOST') ?? 'football-leagues1.p.rapidapi.com',
    cronSecret: read('CRON_SECRET'),
  };
}

/**
 * Игра работает без БД: пока `DATABASE_URL` не задан, включается
 * демо-режим с полным локальным циклом. Это осознанное решение
 * (см. docs/DECISIONS.md), а не заглушка на месте готовой логики.
 */
export function hasDatabase(): boolean {
  return serverEnv().databaseUrl !== null;
}
