-- 0008: статистика матча для новых типов прогнозов (угловые, карточки, владение, удары в створ).

alter table matches add column if not exists corners_home integer;
alter table matches add column if not exists corners_away integer;
alter table matches add column if not exists yellow_cards_home integer;
alter table matches add column if not exists yellow_cards_away integer;
alter table matches add column if not exists red_cards_home integer;
alter table matches add column if not exists red_cards_away integer;
alter table matches add column if not exists possession_home integer;
alter table matches add column if not exists possession_away integer;
alter table matches add column if not exists shots_on_target_home integer;
alter table matches add column if not exists shots_on_target_away integer;
