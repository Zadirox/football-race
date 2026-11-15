-- 0013: performance indexes for cards/packs/collection hot paths.
-- Additive and idempotent.

-- Template selection/progress by set and rarity.
create index if not exists cards_set_rarity_idx
  on cards (set_id, rarity);

-- Collection list ordering for a user's season instances.
create index if not exists card_instances_owner_season_created_idx
  on card_instances (owner_id, season_id, created_at desc, id desc);

-- Unopened packs listing/count ordering (partial opened index already exists).
create index if not exists pack_grants_profile_season_granted_idx
  on pack_grants (profile_id, season_id, granted_at asc, id asc);
