/**
 * Обязательная инициализация сезона (без тестовых пользователей/матчей/вопросов).
 *
 * Запуск: `npm run bootstrap:season`
 *
 * Нужны:
 * - DATABASE_URL или SUPABASE_DB_URL
 * - BOOTSTRAP_SEASON_SLUG (например winter-2026)
 * - BOOTSTRAP_SEASON_TITLE
 * - BOOTSTRAP_SEASON_START (YYYY-MM-DD)
 * - BOOTSTRAP_SEASON_END (YYYY-MM-DD)
 * - BOOTSTRAP_BOARD_SEED (целое число, опционально; по умолчанию детерминированно от slug)
 *
 * Создаёт/обновляет сезон и 80 клеток карты. Не создаёт auth-пользователей,
 * не выдаёт пароли, не создаёт демо-матчи/вопросы/ответы.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
import { generateReworkedBoard } from '../lib/game/board';

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

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function defaultSeed(slug: string): number {
  const hex = createHash('sha1').update(slug).digest('hex').slice(0, 8);
  return parseInt(hex, 16) >>> 0;
}

async function main(): Promise<void> {
  loadEnvFiles();

  const databaseUrl = read('DATABASE_URL') ?? read('SUPABASE_DB_URL');
  if (!databaseUrl) throw new Error('Не задан DATABASE_URL (или SUPABASE_DB_URL).');

  const slug = requireEnv('BOOTSTRAP_SEASON_SLUG');
  const title = requireEnv('BOOTSTRAP_SEASON_TITLE');
  const startsOn = requireEnv('BOOTSTRAP_SEASON_START');
  const endsOn = requireEnv('BOOTSTRAP_SEASON_END');
  const boardSeedRaw = read('BOOTSTRAP_BOARD_SEED');
  const boardSeed = boardSeedRaw ? Number(boardSeedRaw) : defaultSeed(slug);

  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/i.test(slug)) {
    throw new Error('BOOTSTRAP_SEASON_SLUG: используйте латиницу/цифры/дефис (2–50 символов).');
  }
  if (!isDate(startsOn) || !isDate(endsOn)) {
    throw new Error('BOOTSTRAP_SEASON_START/END должны быть в формате YYYY-MM-DD.');
  }
  if (!Number.isInteger(boardSeed)) {
    throw new Error('BOOTSTRAP_BOARD_SEED должен быть целым числом.');
  }

  const board = generateReworkedBoard();
  const sql = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} });

  try {
    await sql.begin(async (tx) => {
      const [season] = await tx<{ id: string }[]>`
        insert into seasons (slug, title, status, starts_on, ends_on, board_seed)
        values (${slug}, ${title}, 'active', ${startsOn}::date, ${endsOn}::date, ${boardSeed})
        on conflict (slug) do update
          set title = excluded.title,
              status = 'active',
              starts_on = excluded.starts_on,
              ends_on = excluded.ends_on,
              board_seed = excluded.board_seed
        returning id
      `;
      if (!season) throw new Error('Не удалось создать или обновить сезон.');

      for (const cell of board.cells) {
        await tx`
          insert into cells (season_id, idx, kind, mechanic_code, zone)
          values (
            ${season.id},
            ${cell.idx},
            ${cell.kind},
            ${cell.mechanicCode},
            ${cell.idx <= 40 ? 'autumn' : 'winter'}
          )
          on conflict (season_id, idx) do update
            set kind = excluded.kind,
                mechanic_code = excluded.mechanic_code,
                zone = excluded.zone
        `;
      }

      const [hasLog] = await tx<{ n: number }[]>`
        select count(*)::int as n from activity_log where season_id = ${season.id}
      `;
      if ((hasLog?.n ?? 0) === 0) {
        await tx`
          insert into activity_log (season_id, kind, message)
          values (${season.id}, 'system', ${`Сезон «${title}» подготовлен.`})
        `;
      }

      console.log(`Сезон готов: ${title} (${slug}, id=${season.id})`);
      console.log(`Карта: ${board.cells.length} клеток, seed=${boardSeed}.`);
      console.log('Тестовые пользователи, матчи и вопросы не создавались.');
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
