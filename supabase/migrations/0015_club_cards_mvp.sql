-- DRAFT (NOT AGREED FOR APPLY): 0015_club_cards_mvp_draft.sql
-- Target: 2C.5b (B1, package D1-A + D2-A + D3-A), based on agreed 2C.4/2C.5a.
-- DO NOT APPLY without explicit confirmation of migration/apply step.
--
-- Scope (schema-only draft):
-- 1) Club card_set + club pack (M1, D3-A), fixed IDs, odds/bonus params for A+ (C weights).
-- 2) Club card template fields/linkage on cards (D1-A): club_id + stable player key from master.
-- 3) Pack opening results for 1-2 cards per opening event (D2-A): pack_opening_cards child table + backfill.
-- 4) Constraints/indexes/RLS grants as needed.
-- Data load (491 templates, clubs upsert alignment) is 2C.5c (C1, separate agreed step/script).

begin;

-- ---------- 1) Club card set and pack (M1, D3-A) ----------
-- Fixed IDs proposed for stable references (similar to national MVP constants).
-- set:  00000000-0000-0000-0000-00000000c002 (club)
-- pack: 00000000-0000-0000-0000-00000000a002 (club pack)

insert into card_sets (id, kind, title, is_active)
values ('00000000-0000-0000-0000-00000000c002', 'club', 'Клубные карточки', true)
on conflict (id) do update
  set kind = excluded.kind,
      title = excluded.title,
      is_active = excluded.is_active;

-- A+ (agreed): 1 guaranteed card + 10% chance for a 2nd card.
-- Rarity weights C (agreed, per roll): common 55, rare 28, epic 13, legend 4.
-- Representation draft: odds jsonb carries rarity weights + bonusSecondChance; cards_count = 1 (base).
-- Alternative to confirm: dedicated columns (e.g. bonus_second_chance_pct, cards_count_max). Draft uses jsonb-only to avoid extra columns.
insert into packs (id, set_id, title, cost_points, cards_count, odds, is_active)
values (
  '00000000-0000-0000-0000-00000000a002',
  '00000000-0000-0000-0000-00000000c002',
  'Клубный пак',
  0,
  1,
  '{"common":55,"rare":28,"epic":13,"legend":4,"bonusSecondChance":10}'::jsonb,
  true
)
on conflict (id) do update
  set set_id = excluded.set_id,
      title = excluded.title,
      cost_points = excluded.cost_points,
      cards_count = excluded.cards_count,
      odds = excluded.odds,
      is_active = excluded.is_active;

-- ---------- 2) Club card template fields (D1-A) ----------
-- Master source: data/club-cards.master.json (491, 24 clubs), agreed in 2C.5a.
-- Strategy: self-contained templates keyed by (set_id, club_id, player_key) without requiring players/membership rows for MVP.

alter table cards
  add column if not exists club_id uuid references clubs(id),
  add column if not exists player_slug text,      -- master playerSlug (stable per club in master)
  add column if not exists main_pos text;         -- optional: master mainPos (e.g. ПВ, ЦП)

-- Club template identity for idempotent upsert/load from master.
-- Uses club_id + player_slug (from master) as the stable template key within a set.
create unique index if not exists cards_club_template_uidx
  on cards (set_id, club_id, player_slug)
  where club_id is not null and player_slug is not null;

-- Helpful lookup indexes for collection/filtering by club/set.
create index if not exists cards_club_id_idx on cards (club_id) where club_id is not null;
create index if not exists cards_set_rarity_idx on cards (set_id, rarity);

-- Optional: document expected mapping (not enforced here)
-- cards.player_name   <- master.playerName
-- cards.role_group    <- master.roleGroup (GK/DEF/MID/FWD)
-- cards.rating        <- master.overall
-- cards.overall       <- master.overall (kept aligned with rating for compatibility)
-- cards.rarity        <- master.rarity (Variant 2 thresholds)
-- cards.photo_url     <- master.photoPath or resolved public path (convention to confirm in 2C.5c)
-- cards.position      <- master.mainPos (existing column) and/or main_pos
-- cards.club_name     <- master.clubNameRu (denormalized convenience)
-- cards.external_player_id <- optional composite key if desired for generic uniqueness compatibility

-- ---------- 3) Pack openings: 1 event, 1-2 card results (D2-A, B1-x) ----------
-- Current model: pack_openings has single card_instance_id/rolled_rarity and unique(pack_grant_id).
-- Draft model: pack_openings remains the opening event per grant; per-card results live in pack_opening_cards.

create table if not exists pack_opening_cards (
  id uuid primary key default gen_random_uuid(),
  opening_id uuid not null references pack_openings(id) on delete cascade,
  card_instance_id uuid references card_instances(id) on delete set null, -- null => no card for this draw (e.g. collection complete)
  rolled_rarity text not null,
  card_index integer not null default 1,
  created_at timestamptz not null default now(),
  constraint pack_opening_cards_rarity_check check (rolled_rarity in ('common','rare','epic','legend')),
  constraint pack_opening_cards_index_check check (card_index >= 1 and card_index <= 2), -- A+: at most 2 cards
  constraint pack_opening_cards_opening_index_uidx unique (opening_id, card_index)
);

create index if not exists pack_opening_cards_opening_idx on pack_opening_cards (opening_id);
create index if not exists pack_opening_cards_instance_idx on pack_opening_cards (card_instance_id) where card_instance_id is not null;

-- Backfill existing opening results into child rows (idempotent).
insert into pack_opening_cards (opening_id, card_instance_id, rolled_rarity, card_index)
select po.id,
       po.card_instance_id,
       coalesce(po.rolled_rarity, c.rarity, 'common') as rolled_rarity,
       1 as card_index
  from pack_openings po
  left join card_instances ci on ci.id = po.card_instance_id
  left join cards c on c.id = ci.card_id
 where not exists (
   select 1 from pack_opening_cards poc where poc.opening_id = po.id and poc.card_index = 1
 );

-- Compatibility note (important for coordinated apply + code update):
-- - pack_openings.card_instance_id and pack_openings.rolled_rarity are kept in this draft to avoid
--   breaking existing reads/writes during transition. New multi-card logic should write/read pack_opening_cards.
-- - A follow-up cleanup migration (dropping/syncing legacy columns) can be agreed after code is migrated.
-- - RLS: pack_opening_cards inherits access via join to pack_openings/ownership in app queries; explicit RLS/policies
--   to be added if/when direct client access is required (current pack_openings access patterns are server/service-driven).

-- ---------- 4) Grants/notes ----------
-- pack_grants schema already supports matchday grants keyed by (matchday_id, profile_id, grant_index) with source='matchday'.
-- T1 (club): 1 pack per resolved club matchday, 2 if gold -> represented as grant_index 1..n (same pattern as national).
-- Implementation detail (later, out of schema-only draft): grant selection logic must distinguish club vs national matchdays
-- despite sstats provider usage (2C.3), e.g. via matchday/competition context, to issue the correct pack_id.

commit;

-- Open points to confirm with this draft:
-- * pack.odds representation for bonusSecondChance (jsonb field vs dedicated column) and exact key name.
-- * photo_url convention (store 'cards/clubs/...' as in master vs '/cards/clubs/...').
-- * whether to keep/sync legacy pack_openings.card_instance_id,rolled_rarity during transition.
-- * exact club template uniqueness key: (set_id, club_id, player_slug) proposed; player_slug comes from master and matches portrait slug.
-- * need for RLS policies on pack_opening_cards now vs later.
-- * clubs upsert (24 clubs) location: 2C.5c load script vs migration.