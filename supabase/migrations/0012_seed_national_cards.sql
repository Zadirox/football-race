-- 0012: сид национального набора карточек (MVP, сборные).
-- Аддитивно/идемпотентно: сет + пак + шаблоны карт из существующих игроков сборных.

-- Стабильные идентификаторы для воспроизводимости и ссылок в коде
-- set:  00000000-0000-0000-0000-00000000c001 (national "Сборные")
-- pack: 00000000-0000-0000-0000-00000000p001 ("Пак сборных")

insert into card_sets (id, kind, title, is_active)
values ('00000000-0000-0000-0000-00000000c001', 'national', 'Сборные', true)
on conflict (id) do update
  set kind = excluded.kind,
      title = excluded.title,
      is_active = excluded.is_active;

insert into packs (id, set_id, title, cost_points, cards_count, odds, is_active)
values (
  '00000000-0000-0000-0000-00000000p001',
  '00000000-0000-0000-0000-00000000c001',
  'Пак сборных',
  0,
  1,
  '{"common":70,"rare":22,"epic":7,"legend":1}'::jsonb,
  true
)
on conflict (id) do update
  set set_id = excluded.set_id,
      title = excluded.title,
      cost_points = excluded.cost_points,
      cards_count = excluded.cards_count,
      odds = excluded.odds,
      is_active = excluded.is_active;

-- Материализация шаблонов из членств игроков в сборных.
-- Рейтинг/редкость детерминированы по (имя, slug сборной) для воспроизводимого сида.
insert into cards (
  set_id,
  player_id,
  national_team_id,
  external_player_id,
  player_name,
  position,
  nationality,
  photo_url,
  overall,
  rarity,
  role_group,
  rating
)
select
  '00000000-0000-0000-0000-00000000c001'::uuid as set_id,
  m.player_id,
  m.national_team_id,
  (m.player_id::text || ':' || m.national_team_id::text) as external_player_id,
  p.name as player_name,
  m.role_group as position,
  nt.name as nationality,
  null::text as photo_url,
  (60 + (abs(hashtext(p.name || '|' || nt.slug)) % 33))::int as overall,
  case
    when (abs(hashtext(p.name || '|' || nt.slug || '|r')) % 100) < 70 then 'common'
    when (abs(hashtext(p.name || '|' || nt.slug || '|r')) % 100) < 92 then 'rare'
    when (abs(hashtext(p.name || '|' || nt.slug || '|r')) % 100) < 99 then 'epic'
    else 'legend'
  end as rarity,
  m.role_group as role_group,
  (60 + (abs(hashtext(p.name || '|' || nt.slug)) % 33))::int as rating
from player_national_team_memberships m
join players p on p.id = m.player_id
join national_teams nt on nt.id = m.national_team_id
on conflict (set_id, player_id, national_team_id) where player_id is not null and national_team_id is not null do update
  set external_player_id = excluded.external_player_id,
      player_name = excluded.player_name,
      position = excluded.position,
      nationality = excluded.nationality,
      photo_url = coalesce(cards.photo_url, excluded.photo_url),
      overall = excluded.overall,
      rarity = excluded.rarity,
      role_group = excluded.role_group,
      rating = excluded.rating;
