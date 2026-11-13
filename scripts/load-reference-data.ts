/**
 * Загрузка справочников сборных/клубов/игроков (задача 2, вариант A).
 *
 * Источники: players_nation_league_positions.csv, players_champions_positions.csv
 * Идемпотентно: сборные/клубы/игроки и связи создаются или обновляются без дублей.
 * Один человек (одно имя) = одна запись игрока; связи со сборной и клубом отдельные.
 *
 * Запуск: `npm run load:reference-data`
 * Нужен: DATABASE_URL или SUPABASE_DB_URL
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const key = match[1] as string;
      if (process.env[key] !== undefined) continue;
      let value = match[2] as string;
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

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9а-я\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseCsv(path: string): Record<string, string>[] {
  const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]!] = cols[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

async function main(): Promise<void> {
  loadEnvFiles();

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) throw new Error('MISSING_ENV:DATABASE_URL');

  const natPath = resolve(process.cwd(), 'players_nation_league_positions.csv');
  const clubPath = resolve(process.cwd(), 'players_champions_positions.csv');
  if (!existsSync(natPath)) throw new Error(`MISSING_FILE:${natPath}`);
  if (!existsSync(clubPath)) throw new Error(`MISSING_FILE:${clubPath}`);

  const natRows = parseCsv(natPath);
  const clubRows = parseCsv(clubPath);

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const teamNames = Array.from(new Set(natRows.map((r) => (r.team || '').trim()).filter(Boolean)));
    const clubNames = Array.from(new Set(clubRows.map((r) => (r.club || '').trim()).filter(Boolean)));

    const teamIds = new Map<string, string>();
    for (const name of teamNames) {
      const slug = slugify(name) || name;
      const rows = await sql<{ id: string }[]>`
        insert into national_teams (name, slug)
        values (${name}, ${slug})
        on conflict (name) do update set slug = excluded.slug
        returning id
      `;
      teamIds.set(name, rows[0]!.id);
    }

    const clubIds = new Map<string, string>();
    for (const name of clubNames) {
      const slug = slugify(name) || name;
      const rows = await sql<{ id: string }[]>`
        insert into clubs (name, slug)
        values (${name}, ${slug})
        on conflict (name) do update set slug = excluded.slug
        returning id
      `;
      clubIds.set(name, rows[0]!.id);
    }

    // Ensure players exist (one per person by normalized name)
    const allPlayerNames = new Map<string, string>(); // normalized -> display
    for (const r of natRows) {
      const name = (r.player || '').trim();
      if (!name) continue;
      const norm = normalizeName(name);
      if (!allPlayerNames.has(norm)) allPlayerNames.set(norm, name);
    }
    for (const r of clubRows) {
      const name = (r.player || '').trim();
      if (!name) continue;
      const norm = normalizeName(name);
      if (!allPlayerNames.has(norm)) allPlayerNames.set(norm, name);
    }

    const playerIds = new Map<string, string>(); // normalized -> id
    for (const [norm, display] of Array.from(allPlayerNames.entries())) {
      const rows = await sql<{ id: string }[]>`
        insert into players (name, name_normalized)
        values (${display}, ${norm})
        on conflict (name_normalized) do update set name = excluded.name
        returning id
      `;
      playerIds.set(norm, rows[0]!.id);
    }

    let natMemberships = 0;
    for (const r of natRows) {
      const team = (r.team || '').trim();
      const player = (r.player || '').trim();
      if (!team || !player) continue;
      const playerId = playerIds.get(normalizeName(player));
      const teamId = teamIds.get(team);
      if (!playerId || !teamId) continue;
      await sql`
        insert into player_national_team_memberships (player_id, national_team_id, position, role_group, note)
        values (${playerId}, ${teamId}, ${(r.position || '').trim()}, ${(r.role_group || '').trim()}, ${(r.note || '').trim()})
        on conflict (player_id, national_team_id) do update set
          position = excluded.position,
          role_group = excluded.role_group,
          note = excluded.note
      `;
      natMemberships++;
    }

    let clubMemberships = 0;
    for (const r of clubRows) {
      const club = (r.club || '').trim();
      const player = (r.player || '').trim();
      if (!club || !player) continue;
      const playerId = playerIds.get(normalizeName(player));
      const clubId = clubIds.get(club);
      if (!playerId || !clubId) continue;
      await sql`
        insert into player_club_memberships (player_id, club_id, position, role_group, note)
        values (${playerId}, ${clubId}, ${(r.position || '').trim()}, ${(r.role_group || '').trim()}, ${(r.note || '').trim()})
        on conflict (player_id, club_id) do update set
          position = excluded.position,
          role_group = excluded.role_group,
          note = excluded.note
      `;
      clubMemberships++;
    }

    console.log(
      `REFERENCE DATA LOADED: teams=${teamNames.length} clubs=${clubNames.length} players=${allPlayerNames.size} national_memberships=${natMemberships} club_memberships=${clubMemberships}`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('REFERENCE DATA LOAD FAILED');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
