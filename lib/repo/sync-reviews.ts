import { db } from '@/lib/db';
import { hasDatabase } from '@/lib/env';

export type SyncMatchReviewRow = {
  id: string;
  season_id: string;
  matchday_id: string | null;
  provider: string;
  external_id: string;
  league_code: string | null;
  home_name: string;
  away_name: string;
  kickoff_utc: string | null;
  canonical_key_candidate: string | null;
  reason: string;
  payload: unknown;
  status: 'pending' | 'resolved' | 'ignored';
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
};

export async function listSyncMatchReviews(limit = 50): Promise<SyncMatchReviewRow[]> {
  if (!hasDatabase()) return [];
  const sql = db();
  try {
    const rows = await sql<SyncMatchReviewRow[]>`
      select id, season_id, matchday_id, provider, external_id, league_code,
             home_name, away_name, kickoff_utc::text as kickoff_utc,
             canonical_key_candidate, reason, payload, status,
             resolution_note, resolved_at::text as resolved_at, created_at::text as created_at
      from sync_match_reviews
      order by (status = 'pending') desc, created_at desc
      limit ${limit}
    `;
    return rows;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('sync_match_reviews') || msg.includes('does not exist')) return [];
    throw error;
  }
}

export async function resolveSyncMatchReview(input: {
  id: string;
  status: 'resolved' | 'ignored';
  note?: string | null;
  actorId?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!hasDatabase()) return { ok: false, reason: 'CONFIG_MISSING' };
  const sql = db();
  try {
    const rows = await sql<{ id: string }[]>`
      update sync_match_reviews
         set status = ${input.status},
             resolution_note = ${input.note ?? null},
             resolved_at = now(),
             resolved_by = ${input.actorId ?? null}::uuid,
             updated_at = now()
       where id = ${input.id}::uuid
         and status = 'pending'
      returning id
    `;
    if (!rows[0]) return { ok: false, reason: 'NOT_FOUND_OR_ALREADY_RESOLVED' };
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('sync_match_reviews') || msg.includes('does not exist')) return { ok: false, reason: 'TABLE_MISSING' };
    throw error;
  }
}
