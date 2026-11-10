/**
 * Сид первого игрового дня: сезон «Зимний 2026», 12 ноября, 5 матчей Лиги наций.
 *
 * Запуск: `npm run seed` (нужны DATABASE_URL, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY и SEED_PASSWORD).
 *
 * Идемпотентен: аккаунты ищутся по почте, профили и сезон — по фиксированным id,
 * вопросы — по детерминированным UUID. Повторный запуск не сбрасывает позиции,
 * статусы матчей и уже отправленные ответы.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { generateBoard } from '../lib/game/board';
import { generateMatchQuestions } from '../lib/data/questions';
import { gameDayWindow } from '../lib/time';

const GAME_DATE = '2026-11-12';
const SEASON_SLUG = 'winter-2026';
const SEASON_TITLE = 'Зимний сезон 2026';
const BOARD_SEED = 20261112;
const REGULAR_PER_MATCH = 4;

type Person = {
  key: string;
  nickname: string;
  email: string;
  role: 'admin' | 'player' | 'spectator';
  inSeason: boolean;
};

const PEOPLE: Person[] = [
  { key: 'shah', nickname: 'Шах', email: 'shah@football.local', role: 'admin', inSeason: true },
  { key: 'anya', nickname: 'Аня', email: 'anya@football.local', role: 'player', inSeason: true },
  { key: 'mark', nickname: 'Марк', email: 'mark@football.local', role: 'player', inSeason: true },
  { key: 'dima', nickname: 'Дима', email: 'dima@football.local', role: 'player', inSeason: true },
  { key: 'liza', nickname: 'Лиза', email: 'liza@football.local', role: 'player', inSeason: true },
  { key: 'kirill', nickname: 'Кирилл', email: 'kirill@football.local', role: 'player', inSeason: true },
  { key: 'guest', nickname: 'Гость', email: 'guest@football.local', role: 'spectator', inSeason: false },
];

type SeedMatch = {
  externalId: string;
  homeName: string;
  awayName: string;
  kickoffUtc: string;
};

const MATCHES: SeedMatch[] = [
  { externalId: 'seed-unl-1', homeName: 'Сербия', awayName: 'Швейцария', kickoffUtc: '2026-11-12T17:00:00.000Z' },
  { externalId: 'seed-unl-2', homeName: 'Франция', awayName: 'Италия', kickoffUtc: '2026-11-12T19:45:00.000Z' },
  { externalId: 'seed-unl-3', homeName: 'Испания', awayName: 'Нидерланды', kickoffUtc: '2026-11-12T19:45:00.000Z' },
  { externalId: 'seed-unl-4', homeName: 'Португалия', awayName: 'Хорватия', kickoffUtc: '2026-11-12T21:00:00.000Z' },
  { externalId: 'seed-unl-5', homeName: 'Германия', awayName: 'Англия', kickoffUtc: '2026-11-12T23:00:00.000Z' },
];

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

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Не задана переменная ${name}. Заполни .env и повтори.`);
  return value;
}

/** Детерминированный UUID из строки — чтобы повторный сид не плодил вопросы. */
function stableUuid(key: string): string {
  const hash = createHash('sha1').update(key).digest('hex');
  const variant = ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(
    17,
    20,
  )}-${hash.slice(20, 32)}`;
}

async function ensureAuthUsers(
  supabaseUrl: string,
  serviceKey: string,
  password: string,
): Promise<Map<string, string>> {
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listError) throw new Error(`Не удалось прочитать пользователей: ${listError.message}`);

  const byEmail = new Map<string, string>();
  for (const user of listed.users) {
    if (user.email) byEmail.set(user.email.toLowerCase(), user.id);
  }

  const ids = new Map<string, string>();
  for (const person of PEOPLE) {
    const email = person.email.toLowerCase();
    let id = byEmail.get(email);

    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email: person.email,
        password,
        email_confirm: true,
        user_metadata: { nickname: person.nickname },
      });
      if (error || !data.user) {
        throw new Error(`Не удалось создать ${person.email}: ${error?.message ?? 'нет пользователя'}`);
      }
      id = data.user.id;
      byEmail.set(email, id);
    } else {
      // Пароль обновляем только у существующего аккаунта: сид не должен падать
      // на повторном запуске, но и не перетирает профиль.
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) throw new Error(`Не удалось обновить пароль ${person.email}: ${error.message}`);
    }

    ids.set(person.key, id);
  }

  return ids;
}

async function main(): Promise<void> {
  loadEnvFiles();

  const databaseUrl = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (!databaseUrl) throw new Error('Не задан DATABASE_URL (или SUPABASE_DB_URL)');
  const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const password = requireEnv('SEED_PASSWORD');
  if (password.length < 8) throw new Error('SEED_PASSWORD должен быть не короче 8 символов');

  const profileIds = await ensureAuthUsers(supabaseUrl, serviceKey, password);
  const sql = postgres(databaseUrl, { max: 3, prepare: false, onnotice: () => {} });

  const seasonId = stableUuid(`season:${SEASON_SLUG}`);
  const matchdayId = stableUuid(`matchday:${GAME_DATE}`);
  const window = gameDayWindow(GAME_DATE);
  const board = generateBoard(BOARD_SEED);

  try {
    await sql.begin(async (tx) => {
      // ---------- профили ----------
      for (const person of PEOPLE) {
        const id = profileIds.get(person.key);
        if (!id) throw new Error(`Нет auth-пользователя для ${person.key}`);
        await tx`
          insert into profiles (id, nickname, role)
          values (${id}, ${person.nickname}, ${person.role}::user_role)
          on conflict (id) do update set nickname = excluded.nickname
        `;
      }

      // ---------- сезон ----------
      const [seasonRow] = await tx<{ id: string }[]>`
        insert into seasons (id, slug, title, status, starts_on, ends_on, board_seed)
        values (${seasonId}, ${SEASON_SLUG}, ${SEASON_TITLE}, 'active', ${GAME_DATE}, '2027-03-01', ${BOARD_SEED})
        on conflict (slug) do update
          set title = excluded.title,
              status = 'active',
              starts_on = excluded.starts_on,
              ends_on = excluded.ends_on
        returning id
      `;
      const activeSeasonId = seasonRow?.id ?? seasonId;

      const seasonPlayers = PEOPLE.filter((person) => person.inSeason).map((person) => ({
        season_id: activeSeasonId,
        profile_id: profileIds.get(person.key) as string,
      }));

      await tx`
        insert into season_players ${tx(seasonPlayers, 'season_id', 'profile_id')}
        on conflict (season_id, profile_id) do nothing
      `;

      // ---------- карта ----------
      for (const cell of board.cells) {
        await tx`
          insert into cells (season_id, idx, kind, mechanic_code, zone)
          values (
            ${activeSeasonId},
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

      // ---------- матчи ----------
      const matchIds = new Map<string, string>();
      for (const match of MATCHES) {
        const id = stableUuid(`match:${match.externalId}`);
        const [matchRow] = await tx<{ id: string }[]>`
          insert into matches (
            id, provider, external_id, league_code, league_title,
            home_name, away_name, kickoff_utc, status
          )
          values (
            ${id}, 'rapidapi', ${match.externalId}, 'UNL', 'Лига наций',
            ${match.homeName}, ${match.awayName}, ${match.kickoffUtc}, 'NS'
          )
          on conflict (provider, external_id) do update
            set league_title = excluded.league_title,
                home_name = excluded.home_name,
                away_name = excluded.away_name
          returning id
        `;
        matchIds.set(match.externalId, matchRow?.id ?? id);
      }

      // ---------- игровой день ----------
      const regularTotal = MATCHES.length * REGULAR_PER_MATCH;
      const [insertedMatchday] = await tx<{ id: string }[]>`
        insert into matchdays (id, season_id, game_date, opens_at, closes_at, status, q_total)
        values (
          ${matchdayId}, ${activeSeasonId}, ${GAME_DATE},
          ${window.opensAt.toISOString()}, ${window.closesAt.toISOString()},
          'scheduled', ${regularTotal}
        )
        on conflict (season_id, game_date) do update
          set opens_at = excluded.opens_at,
              closes_at = excluded.closes_at
        returning id
      `;

      const activeMatchdayId = insertedMatchday?.id ?? matchdayId;

      for (const match of MATCHES) {
        await tx`
          insert into matchday_matches (matchday_id, match_id, in_scope)
          values (${activeMatchdayId}, ${matchIds.get(match.externalId) as string}, true)
          on conflict (matchday_id, match_id) do update set in_scope = true
        `;
      }

      // ---------- вопросы ----------
      let questionIndex = 0;
      for (const [matchIndex, match] of MATCHES.entries()) {
        const generated = generateMatchQuestions(
          { homeName: match.homeName, awayName: match.awayName },
          100 + matchIndex,
          REGULAR_PER_MATCH,
        );

        for (const [index, question] of generated.entries()) {
          const id = stableUuid(`question:${match.externalId}:${index}`);
          await tx`
            insert into questions (
              id, matchday_id, match_id, kind, template, prompt, options, rule,
              locks_at, is_bonus, status, source
            )
            values (
              ${id}, ${activeMatchdayId}, ${matchIds.get(match.externalId) as string},
              ${question.kind}, ${question.rule.type}, ${question.prompt},
              ${tx.json(question.options)}, ${tx.json(question.rule)},
              ${match.kickoffUtc}, ${question.isBonus}, 'open', 'auto'
            )
            on conflict (id) do update
              set kind = excluded.kind,
                  template = excluded.template,
                  prompt = excluded.prompt,
                  options = excluded.options,
                  rule = excluded.rule,
                  locks_at = excluded.locks_at,
                  is_bonus = excluded.is_bonus
          `;
          questionIndex += 1;
        }
      }

      // ---------- стартовая лента ----------
      const [activityCount] = await tx<{ n: number }[]>`
        select count(*)::int as n from activity_log where season_id = ${activeSeasonId}
      `;

      if ((activityCount?.n ?? 0) === 0) {
        await tx`
          insert into activity_log (season_id, kind, message) values
            (${activeSeasonId}, 'system', ${`Сезон «${SEASON_TITLE}» открыт. Первый игровой день — 12 ноября.`}),
            (${activeSeasonId}, 'system', ${`Игровой день 12 ноября: ${MATCHES.length} матчей Лиги наций, ${regularTotal} вопросов.`}),
            (${activeSeasonId}, 'neutral', 'Шесть участников на старте. Кубики появятся после резолва первого дня.')
        `;
      }

      console.log(
        [
          `Сезон: ${SEASON_TITLE} (${activeSeasonId})`,
          `Игровой день: ${GAME_DATE}, матчей ${MATCHES.length}, вопросов ${questionIndex}`,
          `Участников в сезоне: ${seasonPlayers.length}, зрителей: ${PEOPLE.length - seasonPlayers.length}`,
          'Аккаунты:',
          ...PEOPLE.map((person) => `  ${person.email} — ${person.role}${person.inSeason ? '' : ' (вне сезона)'}`),
          'Пароль у всех — значение SEED_PASSWORD из .env',
        ].join('\n'),
      );
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
