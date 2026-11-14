import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { pickCardTemplate, rollRarity, type CardRarity } from '@/lib/game/cards';
import type { OwnedCardView, PackGrantSource, PackGrantView, PackOpenResultView } from '@/lib/types';

export const NATIONAL_CARD_SET_ID = '00000000-0000-0000-0000-00000000c001';
export const NATIONAL_PACK_ID = '00000000-0000-0000-0000-00000000p001';

type DbClient = ReturnType<typeof db>;

type GrantRow = {
  id: string;
  season_id: string;
  profile_id: string;
  pack_id: string;
  source: PackGrantSource;
  matchday_id: string | null;
  cell_event_id: string | null;
  grant_index: number | string;
  granted_at: string | Date;
  opened_at: string | Date | null;
  opened_opening_id: string | null;
  pack_title?: string | null;
};

type PackRow = {
  id: string;
  set_id: string;
  title: string;
  is_active: boolean;
};

type CardTemplateRow = {
  id: string;
  player_name: string;
  nationality: string | null;
  role_group: string | null;
  rating: number | string | null;
  photo_url: string | null;
  rarity: CardRarity;
  national_team_slug: string | null;
};

type OpeningCardRow = {
  grant_id: string;
  opening_id: string | null;
  card_instance_id: string | null;
  rolled_rarity: CardRarity | null;
  opened_at: string | Date | null;
  instance_id: string | null;
  obtained_at: string | Date | null;
  card_id: string | null;
  player_name: string | null;
  nationality: string | null;
  role_group: string | null;
  rating: number | string | null;
  photo_url: string | null;
  rarity: CardRarity | null;
  national_team_slug: string | null;
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIso(value: string | Date | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function asRoleGroup(value: string | null): 'GK' | 'DEF' | 'MID' | 'FWD' {
  if (value === 'GK' || value === 'DEF' || value === 'MID' || value === 'FWD') return value;
  return 'MID';
}

function mapOwnedCard(row: {
  instance_id: string;
  obtained_at: string | Date;
  card_id: string;
  player_name: string;
  nationality: string | null;
  role_group: string | null;
  rating: number | string | null;
  photo_url: string | null;
  rarity: CardRarity;
  national_team_slug: string | null;
}): OwnedCardView {
  return {
    id: row.card_id,
    instanceId: row.instance_id,
    obtainedAt: toIso(row.obtained_at),
    playerName: row.player_name,
    nationalTeam: row.nationality ?? '',
    nationalTeamSlug: row.national_team_slug,
    roleGroup: asRoleGroup(row.role_group),
    rating: toNumber(row.rating),
    photoUrl: row.photo_url,
    rarity: row.rarity,
  };
}

function mapGrantView(row: GrantRow & { pack_title: string }): PackGrantView {
  return {
    id: row.id,
    packTitle: row.pack_title,
    source: row.source,
    createdAt: toIso(row.granted_at),
  };
}

export async function getActiveNationalPack(
  seasonId: string,
  sql: DbClient = db(),
): Promise<PackRow | null> {
  const [row] = await sql<PackRow[]>`
    select p.id, p.set_id, p.title, p.is_active
      from packs p
      join card_sets cs on cs.id = p.set_id
     where cs.kind = 'national'
       and cs.is_active = true
       and p.is_active = true
     order by case when p.id = ${NATIONAL_PACK_ID}::uuid then 0 else 1 end, p.id
     limit 1
  `;
  if (!row) return null;
  // seasonId accepted for season-context resolution; active pack is season-agnostic in MVP.
  void seasonId;
  return row;
}

export async function grantNationalPack(opts: {
  seasonId: string;
  profileId: string;
  packId?: string;
  source: PackGrantSource;
  matchdayId?: string;
  cellEventId?: string;
  grantIndex?: number;
}, sql: DbClient = db()): Promise<GrantRow | null> {
  const packId = opts.packId ?? NATIONAL_PACK_ID;
  const grantIndex = Math.max(1, opts.grantIndex ?? 1);

  if (opts.source === 'matchday') {
    if (!opts.matchdayId) throw new AppError('INVALID_INPUT', 'matchdayId required for matchday grant');
    const [row] = await sql<GrantRow[]>`
      insert into pack_grants (season_id, profile_id, pack_id, source, matchday_id, grant_index)
      values (${opts.seasonId}, ${opts.profileId}, ${packId}, 'matchday', ${opts.matchdayId}, ${grantIndex})
      on conflict (matchday_id, profile_id, grant_index) where matchday_id is not null
      do nothing
      returning id, season_id, profile_id, pack_id, source, matchday_id, cell_event_id, grant_index, granted_at, opened_at, opened_opening_id
    `;
    if (row) return row;
    const [existing] = await sql<GrantRow[]>`
      select id, season_id, profile_id, pack_id, source, matchday_id, cell_event_id, grant_index, granted_at, opened_at, opened_opening_id
        from pack_grants
       where matchday_id = ${opts.matchdayId}
         and profile_id = ${opts.profileId}
         and grant_index = ${grantIndex}
       limit 1
    `;
    return existing ?? null;
  }

  if (opts.source === 'cell') {
    if (!opts.cellEventId) throw new AppError('INVALID_INPUT', 'cellEventId required for cell grant');
    const [row] = await sql<GrantRow[]>`
      insert into pack_grants (season_id, profile_id, pack_id, source, cell_event_id, grant_index)
      values (${opts.seasonId}, ${opts.profileId}, ${packId}, 'cell', ${opts.cellEventId}, 1)
      on conflict (cell_event_id, profile_id) where cell_event_id is not null
      do nothing
      returning id, season_id, profile_id, pack_id, source, matchday_id, cell_event_id, grant_index, granted_at, opened_at, opened_opening_id
    `;
    if (row) return row;
    const [existing] = await sql<GrantRow[]>`
      select id, season_id, profile_id, pack_id, source, matchday_id, cell_event_id, grant_index, granted_at, opened_at, opened_opening_id
        from pack_grants
       where cell_event_id = ${opts.cellEventId}
         and profile_id = ${opts.profileId}
       limit 1
    `;
    return existing ?? null;
  }

  const [row] = await sql<GrantRow[]>`
    insert into pack_grants (season_id, profile_id, pack_id, source, grant_index)
    values (${opts.seasonId}, ${opts.profileId}, ${packId}, 'admin', ${grantIndex})
    returning id, season_id, profile_id, pack_id, source, matchday_id, cell_event_id, grant_index, granted_at, opened_at, opened_opening_id
  `;
  return row ?? null;
}

export async function listUnopenedPacks(
  profileId: string,
  seasonId: string,
  sql: DbClient = db(),
): Promise<PackGrantView[]> {
  const rows = await sql<(GrantRow & { pack_title: string })[]>`
    select g.id, g.season_id, g.profile_id, g.pack_id, g.source, g.matchday_id, g.cell_event_id,
           g.grant_index, g.granted_at, g.opened_at, g.opened_opening_id, p.title as pack_title
      from pack_grants g
      join packs p on p.id = g.pack_id
     where g.profile_id = ${profileId}
       and g.season_id = ${seasonId}
       and g.opened_at is null
     order by g.granted_at asc, g.id asc
  `;
  return rows.map(mapGrantView);
}

async function loadOpenResult(tx: DbClient, grantId: string): Promise<PackOpenResultView | null> {
  const [row] = await tx<OpeningCardRow[]>`
    select g.id as grant_id,
           po.id as opening_id,
           po.card_instance_id,
           po.rolled_rarity,
           po.opened_at,
           ci.id as instance_id,
           ci.created_at as obtained_at,
           c.id as card_id,
           c.player_name,
           c.nationality,
           c.role_group,
           c.rating,
           c.photo_url,
           c.rarity,
           nt.slug as national_team_slug
      from pack_grants g
      left join pack_openings po on po.id = g.opened_opening_id or po.pack_grant_id = g.id
      left join card_instances ci on ci.id = po.card_instance_id
      left join cards c on c.id = ci.card_id
      left join national_teams nt on nt.id = c.national_team_id
     where g.id = ${grantId}
     limit 1
  `;
  if (!row) return null;
  if (!row.opening_id) return null;

  if (row.card_instance_id && row.instance_id && row.card_id && row.player_name && row.rarity) {
    return {
      grantId,
      card: mapOwnedCard({
        instance_id: row.instance_id,
        obtained_at: row.obtained_at ?? row.opened_at ?? new Date(),
        card_id: row.card_id,
        player_name: row.player_name,
        nationality: row.nationality,
        role_group: row.role_group,
        rating: row.rating,
        photo_url: row.photo_url,
        rarity: row.rarity,
        national_team_slug: row.national_team_slug,
      }),
    };
  }

  return { grantId, card: null, collectionComplete: true };
}

export async function openPackGrant(opts: {
  grantId: string;
  profileId: string;
  seasonId: string;
  random?: () => number;
}, sql: DbClient = db()): Promise<PackOpenResultView> {
  const random = opts.random ?? Math.random;

  return await sql.begin(async (tx) => {
    const client = tx as unknown as DbClient;
    const [grant] = await client<GrantRow[]>`
      select id, season_id, profile_id, pack_id, source, matchday_id, cell_event_id, grant_index, granted_at, opened_at, opened_opening_id
        from pack_grants
       where id = ${opts.grantId}
       for update
    `;

    if (!grant) throw new AppError('NOT_FOUND', 'Pack grant not found');
    if (grant.profile_id !== opts.profileId || grant.season_id !== opts.seasonId) {
      throw new AppError('FORBIDDEN');
    }

    if (grant.opened_at || grant.opened_opening_id) {
      const existing = await loadOpenResult(client, grant.id);
      if (existing) return existing;
    }

    const [pack] = await client<{ set_id: string }[]>`
      select set_id from packs where id = ${grant.pack_id} limit 1
    `;
    if (!pack) throw new AppError('NOT_FOUND', 'Pack not found');

    const templates = await client<CardTemplateRow[]>`
      select c.id, c.player_name, c.nationality, c.role_group, c.rating, c.photo_url, c.rarity, nt.slug as national_team_slug
        from cards c
        left join national_teams nt on nt.id = c.national_team_id
       where c.set_id = ${pack.set_id}
         and not exists (
           select 1 from card_instances ci
            where ci.owner_id = ${opts.profileId}
              and ci.season_id = ${opts.seasonId}
              and ci.card_id = c.id
         )
    `;

    const rolled = rollRarity(random);
    const picked = pickCardTemplate(templates, rolled, random);

    if (!picked) {
      const [opening] = await client<{ id: string }[]>`
        insert into pack_openings (pack_id, profile_id, season_id, card_instance_id, rolled_rarity, idempotency_key, pack_grant_id)
        values (${grant.pack_id}, ${opts.profileId}, ${opts.seasonId}, null, ${rolled}, ${grant.id}::uuid, ${grant.id})
        on conflict (pack_grant_id) where pack_grant_id is not null
        do update set opened_at = pack_openings.opened_at
        returning id
      `;
      if (opening) {
        await client`
          update pack_grants
             set opened_at = coalesce(opened_at, now()), opened_opening_id = coalesce(opened_opening_id, ${opening.id}::uuid)
           where id = ${grant.id}
        `;
      }
      return { grantId: grant.id, card: null, collectionComplete: true };
    }

    const [instance] = await client<{ id: string; created_at: string | Date }[]>`
      insert into card_instances (card_id, owner_id, season_id, obtained_from)
      values (${picked.id}, ${opts.profileId}, ${opts.seasonId}, 'pack')
      returning id, created_at
    `;
    if (!instance) throw new AppError('CONFLICT_RETRY', 'Failed to create card instance');

    const [opening] = await client<{ id: string }[]>`
      insert into pack_openings (pack_id, profile_id, season_id, card_instance_id, rolled_rarity, idempotency_key, pack_grant_id)
      values (${grant.pack_id}, ${opts.profileId}, ${opts.seasonId}, ${instance.id}, ${picked.rarity}, ${grant.id}::uuid, ${grant.id})
      returning id
    `;
    if (!opening) throw new AppError('CONFLICT_RETRY', 'Failed to create pack opening');

    await client`
      update pack_grants
         set opened_at = now(), opened_opening_id = ${opening.id}
       where id = ${grant.id}
    `;

    const card = mapOwnedCard({
      instance_id: instance.id,
      obtained_at: instance.created_at,
      card_id: picked.id,
      player_name: picked.player_name,
      nationality: picked.nationality,
      role_group: picked.role_group,
      rating: picked.rating,
      photo_url: picked.photo_url,
      rarity: picked.rarity,
      national_team_slug: picked.national_team_slug,
    });

    return { grantId: grant.id, card };
  });
}

export async function listCollection(
  profileId: string,
  seasonId: string,
  sql: DbClient = db(),
): Promise<OwnedCardView[]> {
  const rows = await sql<{
    instance_id: string;
    obtained_at: string | Date;
    card_id: string;
    player_name: string;
    nationality: string | null;
    role_group: string | null;
    rating: number | string | null;
    photo_url: string | null;
    rarity: CardRarity;
    national_team_slug: string | null;
  }[]>`
    select ci.id as instance_id,
           ci.created_at as obtained_at,
           c.id as card_id,
           c.player_name,
           c.nationality,
           c.role_group,
           c.rating,
           c.photo_url,
           c.rarity,
           nt.slug as national_team_slug
      from card_instances ci
      join cards c on c.id = ci.card_id
      left join national_teams nt on nt.id = c.national_team_id
     where ci.owner_id = ${profileId}
       and ci.season_id = ${seasonId}
     order by ci.created_at desc, ci.id desc
  `;
  return rows.map(mapOwnedCard);
}
