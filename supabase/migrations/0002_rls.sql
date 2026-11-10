-- 0002: доступ. RLS включён везде; серверные операции идут сервис-ролью.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.question_locks_at(qid uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select locks_at from questions where id = qid;
$$;

grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.question_locks_at(uuid) to authenticated, anon;

-- Публичное представление вопросов: correct_option виден только после резолва.
create or replace view questions_public as
select
  id, matchday_id, match_id, kind, template, prompt, options,
  locks_at, is_bonus, status, source, created_at,
  case when status = 'resolved' then correct_option else null end as correct_option
from questions;

grant select on questions_public to authenticated, anon;

alter table profiles            enable row level security;
alter table seasons             enable row level security;
alter table season_players      enable row level security;
alter table cells               enable row level security;
alter table matches             enable row level security;
alter table matchdays           enable row level security;
alter table matchday_matches    enable row level security;
alter table questions           enable row level security;
alter table answers             enable row level security;
alter table dice                enable row level security;
alter table catchup_grants      enable row level security;
alter table rolls               enable row level security;
alter table cell_events         enable row level security;
alter table active_effects      enable row level security;
alter table pending_actions     enable row level security;
alter table score_events        enable row level security;
alter table activity_log        enable row level security;
alter table audit_log           enable row level security;
alter table sync_runs           enable row level security;
alter table app_config          enable row level security;
alter table card_sets           enable row level security;
alter table cards               enable row level security;
alter table card_instances      enable row level security;
alter table packs               enable row level security;
alter table pack_openings       enable row level security;
alter table card_predictions    enable row level security;
alter table trades              enable row level security;
alter table trade_items         enable row level security;
alter table auctions            enable row level security;
alter table auction_bids        enable row level security;

-- ---------- profiles ----------
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select using (true);

drop policy if exists profiles_self_insert on profiles;
create policy profiles_self_insert on profiles for insert
  with check (id = auth.uid());

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles for all
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists profiles_role_guard on profiles;
create trigger profiles_role_guard before update on profiles
  for each row execute function public.prevent_role_escalation();

-- ---------- справочники: читают все, меняет админ ----------
drop policy if exists seasons_read on seasons;
create policy seasons_read on seasons for select using (true);
drop policy if exists seasons_admin on seasons;
create policy seasons_admin on seasons for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists season_players_read on season_players;
create policy season_players_read on season_players for select using (true);
drop policy if exists season_players_admin on season_players;
create policy season_players_admin on season_players for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists cells_read on cells;
create policy cells_read on cells for select using (true);
drop policy if exists cells_admin on cells;
create policy cells_admin on cells for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists matches_read on matches;
create policy matches_read on matches for select using (true);
drop policy if exists matches_admin on matches;
create policy matches_admin on matches for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists matchdays_read on matchdays;
create policy matchdays_read on matchdays for select using (true);
drop policy if exists matchdays_admin on matchdays;
create policy matchdays_admin on matchdays for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists matchday_matches_read on matchday_matches;
create policy matchday_matches_read on matchday_matches for select using (true);
drop policy if exists matchday_matches_admin on matchday_matches;
create policy matchday_matches_admin on matchday_matches for all using (public.is_admin()) with check (public.is_admin());

-- ---------- вопросы: таблица только для админа, игроки читают view ----------
drop policy if exists questions_admin on questions;
create policy questions_admin on questions for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- ответы ----------
drop policy if exists answers_own_or_locked on answers;
create policy answers_own_or_locked on answers for select
  using (
    profile_id = auth.uid()
    or public.is_admin()
    or now() >= public.question_locks_at(question_id)
  );

drop policy if exists answers_insert_before_lock on answers;
create policy answers_insert_before_lock on answers for insert
  with check (
    profile_id = auth.uid()
    and now() < public.question_locks_at(question_id)
  );

drop policy if exists answers_update_before_lock on answers;
create policy answers_update_before_lock on answers for update
  using (profile_id = auth.uid() and now() < public.question_locks_at(question_id))
  with check (profile_id = auth.uid() and now() < public.question_locks_at(question_id));

-- ---------- игровое состояние ----------
drop policy if exists dice_read on dice;
create policy dice_read on dice for select using (true);
drop policy if exists dice_admin on dice;
create policy dice_admin on dice for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists catchup_read on catchup_grants;
create policy catchup_read on catchup_grants for select using (true);

drop policy if exists rolls_read on rolls;
create policy rolls_read on rolls for select using (true);

drop policy if exists cell_events_read on cell_events;
create policy cell_events_read on cell_events for select using (true);

drop policy if exists effects_read on active_effects;
create policy effects_read on active_effects for select using (true);

drop policy if exists pending_read on pending_actions;
create policy pending_read on pending_actions for select
  using (profile_id = auth.uid() or required_profile_id = auth.uid() or public.is_admin());

drop policy if exists scores_read on score_events;
create policy scores_read on score_events for select using (true);

drop policy if exists activity_read on activity_log;
create policy activity_read on activity_log for select using (true);

drop policy if exists audit_admin on audit_log;
create policy audit_admin on audit_log for select using (public.is_admin());

drop policy if exists sync_admin on sync_runs;
create policy sync_admin on sync_runs for select using (public.is_admin());

drop policy if exists config_read on app_config;
create policy config_read on app_config for select using (true);
drop policy if exists config_admin on app_config;
create policy config_admin on app_config for all using (public.is_admin()) with check (public.is_admin());

-- ---------- фаза 2 ----------
drop policy if exists card_sets_read on card_sets;
create policy card_sets_read on card_sets for select using (true);
drop policy if exists cards_read on cards;
create policy cards_read on cards for select using (true);
drop policy if exists card_instances_own on card_instances;
create policy card_instances_own on card_instances for select using (owner_id = auth.uid() or public.is_admin());
drop policy if exists packs_read on packs;
create policy packs_read on packs for select using (true);
drop policy if exists pack_openings_own on pack_openings;
create policy pack_openings_own on pack_openings for select using (profile_id = auth.uid() or public.is_admin());
drop policy if exists trades_own on trades;
create policy trades_own on trades for select using (from_id = auth.uid() or to_id = auth.uid() or public.is_admin());
drop policy if exists auctions_read on auctions;
create policy auctions_read on auctions for select using (true);

-- ---------- права на таблицы ----------
grant usage on schema public to authenticated, anon;
grant select on
  profiles, seasons, season_players, cells, matches, matchdays, matchday_matches,
  dice, catchup_grants, rolls, cell_events, active_effects, score_events, activity_log,
  app_config, card_sets, cards, packs, auctions
  to authenticated;

grant select on questions_public to authenticated, anon;
grant select, insert, update on answers to authenticated;
grant update on profiles to authenticated;
grant insert on profiles to authenticated;
grant select, insert on pending_actions to authenticated;
grant select on audit_log, sync_runs to authenticated;
