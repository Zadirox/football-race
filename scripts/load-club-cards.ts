/**
 * 2C.5c (C1): idempotent load of club cards MVP data from data/club-cards.master.json.
 * Loads: clubs (24), card_set c002, pack a002, 491 card templates into cards (D1-A).
 * Requires schema from 0015_club_cards_mvp.sql to be applied. No DB writes without explicit run.
 *
 * Run: npx tsx scripts/load-club-cards.ts
 * Env: DATABASE_URL or SUPABASE_DB_URL (e.g. from .env.local)
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

const CLUB_CARD_SET_ID = '00000000-0000-0000-0000-00000000c002';
const CLUB_PACK_ID = '00000000-0000-0000-0000-00000000a002';

type MasterPlayer = {
  clubSlug: string;
  clubNameRu: string;
  playerName: string;
  playerSlug: string;
  overall: number;
  rarity: 'common' | 'rare' | 'epic' | 'legend';
  mainPos: string;
  positions: string[];
  roleGroup: 'GK' | 'DEF' | 'MID' | 'FWD';
  photoPath: string;
  ratingSource?: string;
  reviewNote?: string;
};

type MasterFile = {
  players: MasterPlayer[];
  rarityThresholds?: Record<string, string>;
};

function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const key = match[1] as string;
      if (process.env[key] !== undefined) continue;
      let value = match[2] as string;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  loadEnvFiles();

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) throw new Error('MISSING_ENV:DATABASE_URL');

  const masterPath = resolve(process.cwd(), 'data/club-cards.master.json');
  if (!existsSync(masterPath)) throw new Error(`MISSING_FILE:${masterPath}`);

  const master = JSON.parse(readFileSync(masterPath, 'utf8')) as MasterFile;
  const players = master.players ?? [];
  if (players.length !== 491) {
    throw new Error(`UNEXPECTED_MASTER_SIZE:${players.length} (expected 491)`);
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    // 1) Clubs (24) - idempotent upsert aligned to master slugs/names.
    // Some clubs may already exist with legacy Cyrillic slugs (from prior loads); we canonicalize to master slug.
    const clubsBySlug = new Map<string, string>();
    for (const p of players) {
      if (!clubsBySlug.has(p.clubSlug)) clubsBySlug.set(p.clubSlug, p.clubNameRu);
    }

    const clubIdBySlug = new Map<string, string>();
    for (const [slug, name] of Array.from(clubsBySlug.entries())) {
      const [bySlug] = await sql<{ id: string }[]>`select id from clubs where slug = ${slug} limit 1`;
      if (bySlug) {
        await sql`update clubs set name = ${name} where id = ${bySlug.id}::uuid`;
        clubIdBySlug.set(slug, bySlug.id);
        continue;
      }

      const [byName] = await sql<{ id: string; slug: string }[]>`select id, slug from clubs where name = ${name} limit 1`;
      if (byName) {
        // Canonicalize slug to master slug (safe: FKs reference club_id, not slug). Avoid conflict if target slug taken.
        const [slugTaken] = await sql<{ id: string }[]>`select id from clubs where slug = ${slug} and id <> ${byName.id}::uuid limit 1`;
        if (slugTaken) {
          throw new Error(`CLUB_SLUG_CONFLICT:${slug}:${name}:taken_by:${slugTaken.id}`);
        }
        await sql`update clubs set slug = ${slug}, name = ${name} where id = ${byName.id}::uuid`;
        clubIdBySlug.set(slug, byName.id);
        continue;
      }

      const [inserted] = await sql<{ id: string }[]>`
        insert into clubs (name, slug)
        values (${name}, ${slug})
        returning id
      `;
      clubIdBySlug.set(slug, inserted!.id);
    }

    // 2) Card set and pack (idempotent, aligned with 0015 draft)
    await sql`
      insert into card_sets (id, kind, title, is_active)
      values (${CLUB_CARD_SET_ID}::uuid, 'club', 'Клубные карточки', true)
      on conflict (id) do update
        set kind = excluded.kind,
            title = excluded.title,
            is_active = excluded.is_active
    `;

    await sql`
      insert into packs (id, set_id, title, cost_points, cards_count, odds, is_active)
      values (
        ${CLUB_PACK_ID}::uuid,
        ${CLUB_CARD_SET_ID}::uuid,
        'Клубный пак',
        0,
        1,
        ${sql.json({ common: 55, rare: 28, epic: 13, legend: 4, bonusSecondChance: 10 })}::jsonb,
        true
      )
      on conflict (id) do update
        set set_id = excluded.set_id,
            title = excluded.title,
            cost_points = excluded.cost_points,
            cards_count = excluded.cards_count,
            odds = excluded.odds,
            is_active = excluded.is_active
    `;

    // 3) Card templates (491) - upsert by (set_id, club_id, player_slug)
    let upserted = 0;
    for (const p of players) {
      const clubId = clubIdBySlug.get(p.clubSlug);
      if (!clubId) throw new Error(`MISSING_CLUB_ID:${p.clubSlug}`);
      const photoUrl = '/' + p.photoPath.replace(/^\/+/, '');
      const externalPlayerId = `${p.clubSlug}:${p.playerSlug}`;

      await sql`
        insert into cards (
          set_id,
          club_id,
          player_slug,
          main_pos,
          external_player_id,
          player_name,
          position,
          nationality,
          club_name,
          photo_url,
          overall,
          rarity,
          role_group,
          rating
        ) values (
          ${CLUB_CARD_SET_ID}::uuid,
          ${clubId}::uuid,
          ${p.playerSlug},
          ${p.mainPos},
          ${externalPlayerId},
          ${p.playerName},
          ${p.mainPos},
          null,
          ${p.clubNameRu},
          ${photoUrl},
          ${p.overall},
          ${p.rarity},
          ${p.roleGroup},
          ${p.overall}
        )
        on conflict (set_id, club_id, player_slug) where club_id is not null and player_slug is not null
        do update set
          main_pos = excluded.main_pos,
          external_player_id = excluded.external_player_id,
          player_name = excluded.player_name,
          position = excluded.position,
          nationality = excluded.nationality,
          club_name = excluded.club_name,
          photo_url = excluded.photo_url,
          overall = excluded.overall,
          rarity = excluded.rarity,
          role_group = excluded.role_group,
          rating = excluded.rating
      `;
      upserted++;
    }

    // 4) Verification summary
    const [counts] = await sql<{
      clubs: number;
      cards: number;
      legend: number;
      epic: number;
      rare: number;
      common: number;
    }[]>`
      select
        (select count(*)::int from cards where set_id = ${CLUB_CARD_SET_ID}::uuid) as cards,
        (select count(distinct club_id)::int from cards where set_id = ${CLUB_CARD_SET_ID}::uuid) as clubs,
        (select count(*)::int from cards where set_id = ${CLUB_CARD_SET_ID}::uuid and rarity='legend') as legend,
        (select count(*)::int from cards where set_id = ${CLUB_CARD_SET_ID}::uuid and rarity='epic') as epic,
        (select count(*)::int from cards where set_id = ${CLUB_CARD_SET_ID}::uuid and rarity='rare') as rare,
        (select count(*)::int from cards where set_id = ${CLUB_CARD_SET_ID}::uuid and rarity='common') as common
    `;

    const [packRow] = await sql<{ id: string; odds: unknown }[]>`
      select id, odds from packs where id = ${CLUB_PACK_ID}::uuid
    `;

    console.log('CLUB CARDS LOAD DONE');
    console.log(JSON.stringify({
      masterPlayers: players.length,
      upserted,
      clubsDistinct: counts?.clubs ?? 0,
      cardsInSet: counts?.cards ?? 0,
      byRarity: {
        legend: counts?.legend ?? 0,
        epic: counts?.epic ?? 0,
        rare: counts?.rare ?? 0,
        common: counts?.common ?? 0,
      },
      pack: packRow ? { id: packRow.id, odds: packRow.odds } : null,
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('CLUB CARDS LOAD FAILED');
  console.error(error instanceof Error ? (error.stack || error.message) : String(error));
  process.exit(1);
});
