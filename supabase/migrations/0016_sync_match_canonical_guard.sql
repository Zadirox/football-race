-- 0016: canonical match identity guard for sync dedup (C/1A/2A).
-- Adds canonical_key on matchday_matches and a review queue for suspicious matches.

alter table matchday_matches
  add column if not exists canonical_key text;

comment on column matchday_matches.canonical_key is
  'Stable canonical key for same real match within a matchday (home::away, maintained mapping). Null for legacy/unresolved rows.';

create unique index if not exists matchday_matches_canonical_uidx
  on matchday_matches (matchday_id, canonical_key)
  where canonical_key is not null;

create table if not exists sync_match_reviews (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  matchday_id uuid references matchdays(id) on delete cascade,
  provider text not null,
  external_id text not null,
  league_code text,
  home_name text not null,
  away_name text not null,
  kickoff_utc timestamptz,
  canonical_key_candidate text,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'ignored')),
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (matchday_id, provider, external_id)
);

create index if not exists sync_match_reviews_status_idx
  on sync_match_reviews (status, created_at desc);

create index if not exists sync_match_reviews_matchday_idx
  on sync_match_reviews (matchday_id, created_at desc);

alter table sync_match_reviews enable row level security;

drop policy if exists sync_match_reviews_admin_read on sync_match_reviews;
create policy sync_match_reviews_admin_read on sync_match_reviews
  for select using (public.is_admin());

drop policy if exists sync_match_reviews_admin_write on sync_match_reviews;
create policy sync_match_reviews_admin_write on sync_match_reviews
  for all using (public.is_admin()) with check (public.is_admin());

grant select on sync_match_reviews to authenticated;
