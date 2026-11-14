import { matchdayPackCount } from '@/lib/game/cards';
import type { DiceTier } from '@/lib/game/dice';
import { db } from '@/lib/db';
import { getActiveNationalPack, grantNationalPack } from '@/lib/repo/cards';

type DbClient = ReturnType<typeof db>;

type DiceRow = {
  profile_id: string;
  tier: DiceTier | null;
};

export type GrantPacksResult = {
  national: boolean;
  participants: number;
  granted: number;
};

async function isNationalMatchday(matchdayId: string, sql: DbClient): Promise<boolean> {
  const [row] = await sql<{ exists: boolean }[]>`
    select exists (
      select 1
        from matchday_matches mm
        join matches m on m.id = mm.match_id
       where mm.matchday_id = ${matchdayId}
         and mm.in_scope
         and m.provider = 'sstats'
    ) as exists
  `;
  return row?.exists === true;
}

/**
 * After a national matchday is successfully resolved, grant national packs to
 * eligible participants idempotently (gold tier -> 2 packs, else 1 pack).
 * Source of truth for eligibility/tier: base matchday dice rows.
 */
export async function grantPacksForResolvedNationalMatchday(
  matchdayId: string,
  seasonId: string,
  sql: DbClient = db(),
): Promise<GrantPacksResult> {
  const national = await isNationalMatchday(matchdayId, sql);
  if (!national) {
    return { national: false, participants: 0, granted: 0 };
  }

  const pack = await getActiveNationalPack(seasonId, sql);
  if (!pack) {
    throw new Error(`Active national pack not found for season ${seasonId}`);
  }

  const diceRows = await sql<DiceRow[]>`
    select profile_id, tier
      from dice
     where matchday_id = ${matchdayId}
       and source = 'matchday'
  `;

  let granted = 0;
  for (const row of diceRows) {
    const count = matchdayPackCount(row.tier);
    for (let grantIndex = 1; grantIndex <= count; grantIndex++) {
      const grant = await grantNationalPack(
        {
          seasonId,
          profileId: row.profile_id,
          packId: pack.id,
          source: 'matchday',
          matchdayId,
          grantIndex,
        },
        sql,
      );
      if (grant) granted += 1;
    }
  }

  return { national: true, participants: diceRows.length, granted };
}

// Re-export helper for focused tests if needed.
export { isNationalMatchday };
