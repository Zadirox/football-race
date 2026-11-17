-- 0014: admin review state for manual lineup bonus slots.
-- Lets admins mark processed (awarded/not awarded) bonus items as reviewed so they
-- disappear from the active queue without changing awarded points semantics.

alter table lineup_card_results
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references profiles(id) on delete set null;

create index if not exists lineup_card_results_reviewed_idx
  on lineup_card_results (reviewed_at);
