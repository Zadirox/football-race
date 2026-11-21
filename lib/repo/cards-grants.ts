import { matchdayPackCount } from '@/lib/game/cards';
import type { DiceTier } from '@/lib/game/dice';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { CLUB_COMPETITIONS } from '@/lib/data/club-phase';
import {
  CLUB_PACK_ID,
  NATIONAL_PACK_ID,
  getActiveClubPack,
  getActiveNationalPack,
  grantNationalPack,
} from '@/lib/repo/cards';

type DbClient = ReturnType<typeof db>;

type DiceRow = {
  profile_id: string;
  tier: DiceTier | null;
};

export type MatchdayGrantContour = 'national' | 'club' | 'none' | 'ambiguous';

export type GrantPacksResult = {
  contour: MatchdayGrantContour;
  /** Backward-compat flag (true only for national contour grants). */
  national: boolean;
  packId: string | null;
  participants: number;
  granted: number;
  reason: string | null;
};

export type MatchContourRow = {
  provider: string;
  league_code: string | null;
  league_title: string | null;
  raw: unknown;
};

type MatchRow = MatchContourRow;

const CLUB_SSTATS_LEAGUE_IDS = new Set<number>(CLUB_COMPETITIONS.map((c) => c.sstatsLeagueId));

// League codes recognized as club contour. Derived from config (Stage 3, 3.2=A) + safe aliases.
const CLUB_LEAGUE_CODES = new Set<string>([
  ...CLUB_COMPETITIONS.map((c) => c.leagueCode),
  'UCL',
  'UEL',
  'UECL',
  'LL',
  'LALIGA',
  'BUNDESLIGA',
  'SERIEA',
  'LIGUE1',
]);

const NATIONAL_LEAGUE_CODES = new Set<string>(['UNL']);

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/** Best-effort extraction of sstats league id from a stored raw payload. */
export function extractSstatsLeagueId(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const directKeys = ['leagueId', 'LeagueId', 'league_id', 'LeagueID', 'leagueID'];
  for (const key of directKeys) {
    const n = toNumberOrNull(obj[key]);
    if (n !== null) return n;
  }

  const league = obj.league;
  if (league && typeof league === 'object') {
    const l = league as Record<string, unknown>;
    const n = toNumberOrNull(l.id ?? l.leagueId ?? l.LeagueId ?? l.league_id);
    if (n !== null) return n;
  }

  // Shallow scan for any value equal to a known club sstats league id (conservative signal).
  for (const value of Object.values(obj)) {
    const n = toNumberOrNull(value);
    if (n !== null && CLUB_SSTATS_LEAGUE_IDS.has(n)) return n;
  }

  return null;
}

function normalizeLeagueCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const v = String(code).trim().toUpperCase();
  return v.length > 0 ? v : null;
}

export type MatchContour = 'national' | 'club' | 'unknown';

export function classifyMatchContour(match: MatchContourRow): MatchContour {
  const leagueCode = normalizeLeagueCode(match.league_code);

  if (leagueCode && NATIONAL_LEAGUE_CODES.has(leagueCode)) {
    return 'national';
  }

  const sstatsLeagueId = extractSstatsLeagueId(match.raw);
  if (sstatsLeagueId !== null && CLUB_SSTATS_LEAGUE_IDS.has(sstatsLeagueId)) {
    return 'club';
  }

  if (leagueCode && CLUB_LEAGUE_CODES.has(leagueCode)) {
    return 'club';
  }

  return 'unknown';
}

export type MatchdayClassification = {
  contour: MatchdayGrantContour;
  reason: string | null;
  inScopeMatches: number;
  nationalMatches: number;
  clubMatches: number;
  unknownMatches: number;
};

/**
 * Stage 2 (B): config-driven matchday classification with fail-safe.
 * - national: all in-scope matches are national contour (e.g. UNL) -> grant a001.
 * - club: all in-scope matches unambiguously map to club competitions in config -> grant a002.
 * - none: no in-scope matches.
 * - ambiguous: mixed or any unknown/unmapped in-scope match -> no auto grant.
 */
export async function classifyResolvedMatchday(
  matchdayId: string,
  sql: DbClient = db(),
): Promise<MatchdayClassification> {
  const rows = await sql<MatchRow[]>`
    select m.provider, m.league_code, m.league_title, m.raw
      from matchday_matches mm
      join matches m on m.id = mm.match_id
     where mm.matchday_id = ${matchdayId}
       and mm.in_scope
  `;

  const inScopeMatches = rows.length;
  if (inScopeMatches === 0) {
    return {
      contour: 'none',
      reason: 'no_in_scope_matches',
      inScopeMatches: 0,
      nationalMatches: 0,
      clubMatches: 0,
      unknownMatches: 0,
    };
  }

  let nationalMatches = 0;
  let clubMatches = 0;
  let unknownMatches = 0;

  for (const row of rows) {
    const c = classifyMatchContour(row);
    if (c === 'national') nationalMatches += 1;
    else if (c === 'club') clubMatches += 1;
    else unknownMatches += 1;
  }

  if (nationalMatches === inScopeMatches) {
    return {
      contour: 'national',
      reason: null,
      inScopeMatches,
      nationalMatches,
      clubMatches,
      unknownMatches,
    };
  }

  if (clubMatches === inScopeMatches) {
    return {
      contour: 'club',
      reason: null,
      inScopeMatches,
      nationalMatches,
      clubMatches,
      unknownMatches,
    };
  }

  const reason =
    nationalMatches > 0 && clubMatches > 0
      ? 'mixed_contours'
      : unknownMatches > 0
        ? 'unknown_matches'
        : 'ambiguous';

  return {
    contour: 'ambiguous',
    reason,
    inScopeMatches,
    nationalMatches,
    clubMatches,
    unknownMatches,
  };
}

/** @deprecated Prefer classifyResolvedMatchday; kept for compatibility. */
export async function isNationalMatchday(matchdayId: string, sql: DbClient = db()): Promise<boolean> {
  const c = await classifyResolvedMatchday(matchdayId, sql);
  return c.contour === 'national';
}

async function getActivePackForContour(contour: 'national' | 'club', seasonId: string, sql: DbClient) {
  if (contour === 'national') return getActiveNationalPack(seasonId, sql);
  return getActiveClubPack(seasonId, sql);
}

/**
 * After a matchday is successfully resolved, grant packs to eligible participants
 * idempotently based on Stage 2 classification (B, fail-safe):
 * - national contour -> a001, - club contour -> a002 (T1), - ambiguous/none -> no grant.
 * Gold tier -> 2 packs, else 1. Source of truth: base matchday dice rows.
 */
export async function grantPacksForResolvedMatchday(
  matchdayId: string,
  seasonId: string,
  sql: DbClient = db(),
): Promise<GrantPacksResult> {
  if (!serverEnv().cardsEnabled) {
    return { contour: 'none', national: false, packId: null, participants: 0, granted: 0, reason: 'cards_disabled' };
  }

  const classification = await classifyResolvedMatchday(matchdayId, sql);
  if (classification.contour !== 'national' && classification.contour !== 'club') {
    return {
      contour: classification.contour,
      national: false,
      packId: null,
      participants: 0,
      granted: 0,
      reason: classification.reason,
    };
  }

  const pack = await getActivePackForContour(classification.contour, seasonId, sql);
  if (!pack) {
    throw new Error(`Active ${classification.contour} pack not found for season ${seasonId}`);
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

  return {
    contour: classification.contour,
    national: classification.contour === 'national',
    packId: pack.id,
    participants: diceRows.length,
    granted,
    reason: null,
  };
}

/** Backward-compatible wrapper. */
export async function grantPacksForResolvedNationalMatchday(
  matchdayId: string,
  seasonId: string,
  sql: DbClient = db(),
): Promise<GrantPacksResult> {
  return grantPacksForResolvedMatchday(matchdayId, seasonId, sql);
}
