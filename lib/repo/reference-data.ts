import { cache } from 'react';
import { db } from '@/lib/db';
import { hasDatabase } from '@/lib/env';

export type ReferenceOption = {
  id: string;
  name: string;
  /** Подсказка для поиска/отображения (напр. клубы/сборные игрока). */
  context?: string;
};

export type FavoritesPayload = {
  favoriteClubId: string;
  favoriteNationalTeamId: string;
  favoritePlayerId: string;
};

async function listNationalTeamsUncached(): Promise<ReferenceOption[]> {
  if (!hasDatabase()) return [];
  const sql = db();
  const rows = await sql<{ id: string; name: string }[]>`
    select id, name from national_teams order by name
  `;
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

async function listClubsUncached(): Promise<ReferenceOption[]> {
  if (!hasDatabase()) return [];
  const sql = db();
  const rows = await sql<{ id: string; name: string }[]>`
    select id, name from clubs order by name
  `;
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

async function listPlayersUncached(): Promise<ReferenceOption[]> {
  if (!hasDatabase()) return [];
  const sql = db();
  const rows = await sql<{ id: string; name: string; context: string | null }[]>`
    select
      p.id,
      p.name,
      nullif(
        concat_ws(
          ' · ',
          nullif(nat.names, ''),
          nullif(cl.names, '')
        ),
        ''
      ) as context
    from players p
    left join lateral (
      select string_agg(nt.name, ', ' order by nt.name) as names
      from player_national_team_memberships m
      join national_teams nt on nt.id = m.national_team_id
      where m.player_id = p.id
    ) nat on true
    left join lateral (
      select string_agg(c.name, ', ' order by c.name) as names
      from player_club_memberships m
      join clubs c on c.id = m.club_id
      where m.player_id = p.id
    ) cl on true
    order by p.name
  `;
  return rows.map((r) => ({ id: r.id, name: r.name, context: r.context ?? undefined }));
}

export const listNationalTeams = cache(listNationalTeamsUncached);
export const listClubs = cache(listClubsUncached);
export const listPlayers = cache(listPlayersUncached);

export async function loadFavoritesOptions(): Promise<{
  teams: ReferenceOption[];
  clubs: ReferenceOption[];
  players: ReferenceOption[];
}> {
  const [teams, clubs, players] = await Promise.all([
    listNationalTeams(),
    listClubs(),
    listPlayers(),
  ]);
  return { teams, clubs, players };
}

export async function favoritesExist(ids: FavoritesPayload): Promise<boolean> {
  if (!hasDatabase()) return false;
  const sql = db();
  const [row] = await sql<{ ok: boolean }[]>`
    select
      exists(select 1 from clubs where id = ${ids.favoriteClubId}::uuid)
      and exists(select 1 from national_teams where id = ${ids.favoriteNationalTeamId}::uuid)
      and exists(select 1 from players where id = ${ids.favoritePlayerId}::uuid)
      as ok
  `;
  return !!row?.ok;
}
