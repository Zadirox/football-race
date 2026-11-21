import { db } from '@/lib/db';
import { AppError, isAppError } from '@/lib/errors';
import {
  CLUB_BONUS_SECOND_CHANCE,
  CLUB_RARITY_ODDS,
  NATIONAL_RARITY_ODDS,
  pickCardTemplate,
  rollPackRarities,
  type CardRarity,
  type RarityOdds,
} from '@/lib/game/cards';
import type {
  CardSetKind,
  OwnedCardView,
  PackGrantSource,
  PackGrantView,
  PackOpenResultView,
} from '@/lib/types';

export const NATIONAL_CARD_SET_ID = '00000000-0000-0000-0000-00000000c001';
export const NATIONAL_PACK_ID = '00000000-0000-0000-0000-00000000a001';
export const CLUB_CARD_SET_ID = '00000000-0000-0000-0000-00000000c002';
export const CLUB_PACK_ID = '00000000-0000-0000-0000-00000000a002';

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
};

type GrantWithPackRow = GrantRow & {
  pack_title: string;
  pack_set_id: string;
  set_kind: CardSetKind;
};

type PackRow = {
  id: string;
  set_id: string;
  title: string;
  is_active: boolean;
  odds: unknown;
};

type PackMetaRow = {
  id: string;
  set_id: string;
  odds: unknown;
  set_kind: CardSetKind;
};

type CardTemplateRow = {
  id: string;
  set_id: string;
  player_name: string;
  nationality: string | null;
  club_name: string | null;
  club_id: string | null;
  role_group: string | null;
  rating: number | string | null;
  photo_url: string | null;
  rarity: CardRarity;
  national_team_slug: string | null;
  set_kind: CardSetKind;
};

type OpeningCardJoinedRow = {
  card_index?: number | string | null;
  rolled_rarity: CardRarity | null;
  instance_id: string | null;
  obtained_at: string | Date | null;
  card_id: string | null;
  set_id: string | null;
  player_name: string | null;
  nationality: string | null;
  club_name: string | null;
  club_id: string | null;
  role_group: string | null;
  rating: number | string | null;
  photo_url: string | null;
  rarity: CardRarity | null;
  national_team_slug: string | null;
  set_kind: CardSetKind | null;
};

type OpeningHeaderRow = {
  grant_id: string;
  opening_id: string | null;
  opened_at: string | Date | null;
  // legacy single-card columns
  card_instance_id: string | null;
  rolled_rarity: CardRarity | null;
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

function asSetKind(value: string | null | undefined): CardSetKind {
  return value === 'club' ? 'club' : 'national';
}

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505';
}

function parseOdds(raw: unknown): { odds: RarityOdds; bonusSecondChancePercent: number } {
  const fallback = { odds: NATIONAL_RARITY_ODDS, bonusSecondChancePercent: 0 };
  if (!raw || typeof raw !== 'object') return fallback;
  const o = raw as Record<string, unknown>;
  const common = Number(o.common);
  const rare = Number(o.rare);
  const epic = Number(o.epic);
  const legend = Number(o.legend);
  if (![common, rare, epic, legend].every(Number.isFinite)) return fallback;
  const sum = common + rare + epic + legend;
  if (sum <= 0) return fallback;
  const bonus = Number(o.bonusSecondChance ?? 0);
  return {
    odds: { common, rare, epic, legend },
    bonusSecondChancePercent: Number.isFinite(bonus) && bonus > 0 ? bonus : 0,
  };
}

function mapOwnedCard(row: {
  instance_id: string;
  obtained_at: string | Date;
  card_id: string;
  set_id?: string | null;
  player_name: string;
  nationality: string | null;
  club_name?: string | null;
  club_id?: string | null;
  national_team_name?: string | null;
  role_group: string | null;
  rating: number | string | null;
  photo_url: string | null;
  rarity: CardRarity;
  national_team_slug: string | null;
  set_kind?: CardSetKind | string | null;
}): OwnedCardView {
  const nationalTeam = row.national_team_name ?? row.club_name ?? row.nationality ?? '';
  return {
    id: row.card_id,
    instanceId: row.instance_id,
    obtainedAt: toIso(row.obtained_at),
    playerName: row.player_name,
    nationalTeam,
    nationalTeamSlug: row.national_team_slug ?? null,
    clubId: row.club_id ?? null,
    clubName: row.club_name ?? null,
    setId: row.set_id ?? '',
    setKind: asSetKind(row.set_kind),
    roleGroup: asRoleGroup(row.role_group),
    rating: toNumber(row.rating),
    photoUrl: row.photo_url,
    rarity: row.rarity,
  };
}

function mapGrantView(row: GrantWithPackRow): PackGrantView {
  return {
    id: row.id,
    packId: row.pack_id,
    setId: row.pack_set_id,
    setKind: asSetKind(row.set_kind),
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
    select p.id, p.set_id, p.title, p.is_active, p.odds
      from packs p
      join card_sets cs on cs.id = p.set_id
     where cs.kind = 'national'
       and cs.is_active = true
       and p.is_active = true
     order by case when p.id = ${NATIONAL_PACK_ID}::uuid then 0 else 1 end, p.id
     limit 1
  `;
  if (!row) return null;
  void seasonId;
  return row;
}

export async function getActiveClubPack(
  seasonId: string,
  sql: DbClient = db(),
): Promise<PackRow | null> {
  const [row] = await sql<PackRow[]>`
    select p.id, p.set_id, p.title, p.is_active, p.odds
      from packs p
      join card_sets cs on cs.id = p.set_id
     where cs.kind = 'club'
       and cs.is_active = true
       and p.is_active = true
     order by case when p.id = ${CLUB_PACK_ID}::uuid then 0 else 1 end, p.id
     limit 1
  `;
  if (!row) return null;
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
  const rows = await sql<GrantWithPackRow[]>`
    select g.id, g.season_id, g.profile_id, g.pack_id, g.source, g.matchday_id, g.cell_event_id,
           g.grant_index, g.granted_at, g.opened_at, g.opened_opening_id,
           p.title as pack_title, p.set_id as pack_set_id, cs.kind as set_kind
      from pack_grants g
      join packs p on p.id = g.pack_id
      join card_sets cs on cs.id = p.set_id
     where g.profile_id = ${profileId}
       and g.season_id = ${seasonId}
       and g.opened_at is null
     order by g.granted_at asc, g.id asc
  `;
  return rows.map(mapGrantView);
}

export async function countUnopenedPacks(
  profileId: string,
  seasonId: string,
  sql: DbClient = db(),
): Promise<number> {
  const rows = await sql<{ count: number | string }[]>`
    select count(*)::int as count
      from pack_grants g
     where g.profile_id = ${profileId}
       and g.season_id = ${seasonId}
       and g.opened_at is null
  `;
  return toNumber(rows[0]?.count ?? 0);
}

function mapOpeningCards(rows: OpeningCardJoinedRow[]): OwnedCardView[] {
  const cards: OwnedCardView[] = [];
  for (const row of rows) {
    if (!row.instance_id || !row.card_id || !row.player_name || !row.rarity) continue;
    cards.push(mapOwnedCard({
      instance_id: row.instance_id,
      obtained_at: row.obtained_at ?? new Date(),
      card_id: row.card_id,
      set_id: row.set_id,
      player_name: row.player_name,
      nationality: row.nationality,
      club_name: row.club_name,
      club_id: row.club_id,
      role_group: row.role_group,
      rating: row.rating,
      photo_url: row.photo_url,
      rarity: row.rarity,
      national_team_slug: row.national_team_slug,
      set_kind: row.set_kind,
    }));
  }
  return cards;
}

async function loadOpenResult(tx: DbClient, grantId: string): Promise<PackOpenResultView | null> {
  const [header] = await tx<OpeningHeaderRow[]>`
    select g.id as grant_id,
           coalesce(g.opened_opening_id, po.id) as opening_id,
           po.opened_at,
           po.card_instance_id,
           po.rolled_rarity
      from pack_grants g
      left join pack_openings po on po.id = g.opened_opening_id or po.pack_grant_id = g.id
     where g.id = ${grantId}
     limit 1
  `;
  if (!header?.opening_id) return null;

  const cardRows = await tx<OpeningCardJoinedRow[]>`
    select poc.card_index,
           poc.rolled_rarity,
           ci.id as instance_id,
           ci.created_at as obtained_at,
           c.id as card_id,
           c.set_id,
           c.player_name,
           c.nationality,
           c.club_name,
           c.club_id,
           c.role_group,
           c.rating,
           c.photo_url,
           c.rarity,
           nt.slug as national_team_slug,
           cs.kind as set_kind
      from pack_opening_cards poc
      join card_instances ci on ci.id = poc.card_instance_id
      join cards c on c.id = ci.card_id
      join card_sets cs on cs.id = c.set_id
      left join national_teams nt on nt.id = c.national_team_id
     where poc.opening_id = ${header.opening_id}
     order by poc.card_index asc, poc.id asc
  `;

  let cards = mapOpeningCards(cardRows);

  // Fallback for legacy/inconsistent state: read single card from pack_openings.
  if (cards.length === 0 && header.card_instance_id) {
    const legacyRows = await tx<OpeningCardJoinedRow[]>`
      select 1 as card_index,
             ${header.rolled_rarity}::text as rolled_rarity,
             ci.id as instance_id,
             ci.created_at as obtained_at,
             c.id as card_id,
             c.set_id,
             c.player_name,
             c.nationality,
             c.club_name,
             c.club_id,
             c.role_group,
             c.rating,
             c.photo_url,
             c.rarity,
             nt.slug as national_team_slug,
             cs.kind as set_kind
        from card_instances ci
        join cards c on c.id = ci.card_id
        join card_sets cs on cs.id = c.set_id
        left join national_teams nt on nt.id = c.national_team_id
       where ci.id = ${header.card_instance_id}
       limit 1
    `;
    cards = mapOpeningCards(legacyRows);
  }

  return {
    grantId,
    cards,
    card: cards[0] ?? null,
    collectionComplete: cards.length === 0,
  };
}

async function resolveOpenedGrantResult(
  tx: DbClient,
  grantId: string,
): Promise<PackOpenResultView> {
  const result = await loadOpenResult(tx, grantId);
  if (result) return result;
  throw new AppError('CONFLICT', 'Pack grant is opened but opening state is inconsistent');
}

type PickedTemplate = {
  template: CardTemplateRow;
  rolledRarity: CardRarity;
};

function pickTemplatesForRarities(
  available: CardTemplateRow[],
  rarities: CardRarity[],
  random: () => number,
): PickedTemplate[] {
  const remaining = [...available];
  const picks: PickedTemplate[] = [];
  for (const rolledRarity of rarities) {
    const picked = pickCardTemplate(remaining, rolledRarity, random);
    if (!picked) break;
    const idx = remaining.findIndex((t) => t.id === picked.id);
    if (idx >= 0) remaining.splice(idx, 1);
    picks.push({ template: picked as CardTemplateRow, rolledRarity: picked.rarity });
  }
  return picks;
}

async function openPackGrantOnce(opts: {
  grantId: string;
  profileId: string;
  seasonId: string;
  random: () => number;
}, sql: DbClient): Promise<PackOpenResultView> {
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
      return await resolveOpenedGrantResult(client, grant.id);
    }

    const [pack] = await client<PackMetaRow[]>`
      select p.id, p.set_id, p.odds, cs.kind as set_kind
        from packs p
        join card_sets cs on cs.id = p.set_id
       where p.id = ${grant.pack_id}
       limit 1
    `;
    if (!pack) throw new AppError('NOT_FOUND', 'Pack not found');

    const templates = await client<CardTemplateRow[]>`
      select c.id, c.set_id, c.player_name, c.nationality, c.club_name, c.club_id, c.role_group,
             c.rating, c.photo_url, c.rarity, nt.slug as national_team_slug, ${pack.set_kind}::text as set_kind
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

    const parsed = parseOdds(pack.odds);
    const defaultBonus = pack.set_kind === 'club' ? CLUB_BONUS_SECOND_CHANCE : 0;
    const defaultOdds = pack.set_kind === 'club' ? CLUB_RARITY_ODDS : NATIONAL_RARITY_ODDS;
    const odds = parsed.odds ?? defaultOdds;
    const bonusSecondChancePercent = parsed.bonusSecondChancePercent || defaultBonus;

    const rolledRarities = rollPackRarities(opts.random, odds, bonusSecondChancePercent);
    const picks = pickTemplatesForRarities(templates, rolledRarities, opts.random);

    if (picks.length === 0) {
      const [opening] = await client<{ id: string }[]>`
        insert into pack_openings (pack_id, profile_id, season_id, card_instance_id, rolled_rarity, idempotency_key, pack_grant_id)
        values (${grant.pack_id}, ${opts.profileId}, ${opts.seasonId}, null, ${rolledRarities[0] ?? 'common'}, ${grant.id}::uuid, ${grant.id})
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
      return await resolveOpenedGrantResult(client, grant.id);
    }

    const firstPick = picks[0]!;
    const [opening] = await client<{ id: string }[]>`
      insert into pack_openings (pack_id, profile_id, season_id, card_instance_id, rolled_rarity, idempotency_key, pack_grant_id)
      values (${grant.pack_id}, ${opts.profileId}, ${opts.seasonId}, null, ${firstPick.rolledRarity}, ${grant.id}::uuid, ${grant.id})
      on conflict (pack_grant_id) where pack_grant_id is not null
      do nothing
      returning id
    `;
    if (!opening) {
      // Another concurrent opener won for this grant; abort so any side effects roll back.
      throw new AppError('CONFLICT_RETRY', 'Concurrent pack opening lost grant reservation');
    }

    let firstInstanceId: string | null = null;
    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i]!;
      const [instance] = await client<{ id: string }[]>`
        insert into card_instances (card_id, owner_id, season_id, obtained_from)
        values (${pick.template.id}, ${opts.profileId}, ${opts.seasonId}, 'pack')
        returning id
      `;
      if (!instance) throw new AppError('CONFLICT_RETRY', 'Failed to create card instance');
      if (i === 0) firstInstanceId = instance.id;

      await client`
        insert into pack_opening_cards (opening_id, card_instance_id, rolled_rarity, card_index)
        values (${opening.id}::uuid, ${instance.id}::uuid, ${pick.rolledRarity}, ${i + 1})
        on conflict (opening_id, card_index) do nothing
      `;
    }

    await client`
      update pack_openings
         set card_instance_id = coalesce(card_instance_id, ${firstInstanceId}::uuid),
             rolled_rarity = coalesce(rolled_rarity, ${firstPick.rolledRarity})
       where id = ${opening.id}
    `;

    await client`
      update pack_grants
         set opened_at = coalesce(opened_at, now()), opened_opening_id = coalesce(opened_opening_id, ${opening.id}::uuid)
       where id = ${grant.id}
    `;

    return await resolveOpenedGrantResult(client, grant.id);
  });
}

function isRetryableOpenConflict(error: unknown): boolean {
  return isUniqueViolation(error) || (isAppError(error) && error.code === 'CONFLICT_RETRY');
}

export async function openPackGrant(opts: {
  grantId: string;
  profileId: string;
  seasonId: string;
  random?: () => number;
}, sql: DbClient = db()): Promise<PackOpenResultView> {
  const random = opts.random ?? Math.random;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await openPackGrantOnce(
        { grantId: opts.grantId, profileId: opts.profileId, seasonId: opts.seasonId, random },
        sql,
      );
    } catch (error) {
      if (!isRetryableOpenConflict(error)) throw error;
    }
  }

  throw new AppError('CONFLICT_RETRY', 'Pack opening conflicted; please retry');
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
    set_id: string;
    player_name: string;
    nationality: string | null;
    national_team_name: string | null;
    club_name: string | null;
    club_id: string | null;
    role_group: string | null;
    rating: number | string | null;
    photo_url: string | null;
    rarity: CardRarity;
    national_team_slug: string | null;
    set_kind: CardSetKind;
  }[]>`
    select ci.id as instance_id,
           ci.created_at as obtained_at,
           c.id as card_id,
           c.set_id,
           c.player_name,
           c.nationality,
           nt.name as national_team_name,
           c.club_name,
           c.club_id,
           c.role_group,
           c.rating,
           c.photo_url,
           c.rarity,
           nt.slug as national_team_slug,
           cs.kind as set_kind
      from card_instances ci
      join cards c on c.id = ci.card_id
      join card_sets cs on cs.id = c.set_id
      left join national_teams nt on nt.id = c.national_team_id
     where ci.owner_id = ${profileId}
       and ci.season_id = ${seasonId}
     order by ci.created_at desc, ci.id desc
  `;
  return rows.map(mapOwnedCard);
}

export type CollectionProgressView = {
  setId: string;
  owned: number;
  total: number;
  byRarity: Record<CardRarity, { owned: number; total: number }>;
};

export async function getCollectionProgress(
  profileId: string,
  seasonId: string,
  setId: string = NATIONAL_CARD_SET_ID,
  sql: DbClient = db(),
): Promise<CollectionProgressView> {
  const totals = await sql<{ rarity: CardRarity; total: number | string }[]>`
    select c.rarity, count(*)::int as total
      from cards c
     where c.set_id = ${setId}
     group by c.rarity
  `;
  const ownedRows = await sql<{ rarity: CardRarity; owned: number | string }[]>`
    select c.rarity, count(*)::int as owned
      from card_instances ci
      join cards c on c.id = ci.card_id
     where ci.owner_id = ${profileId}
       and ci.season_id = ${seasonId}
       and c.set_id = ${setId}
     group by c.rarity
  `;

  const rarities: CardRarity[] = ['common', 'rare', 'epic', 'legend'];
  const byRarity = {} as CollectionProgressView['byRarity'];
  let owned = 0;
  let total = 0;
  for (const rarity of rarities) {
    const t = toNumber(totals.find((r) => r.rarity === rarity)?.total ?? 0);
    const o = toNumber(ownedRows.find((r) => r.rarity === rarity)?.owned ?? 0);
    byRarity[rarity] = { owned: o, total: t };
    owned += o;
    total += t;
  }

  return { setId, owned, total, byRarity };
}

export async function getCollectionProgresses(
  profileId: string,
  seasonId: string,
  setIds: string[],
  sql: DbClient = db(),
): Promise<CollectionProgressView[]> {
  const unique = Array.from(new Set(setIds.filter(Boolean)));
  const results: CollectionProgressView[] = [];
  for (const id of unique) {
    results.push(await getCollectionProgress(profileId, seasonId, id, sql));
  }
  return results;
}
