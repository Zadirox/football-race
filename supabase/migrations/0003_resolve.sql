-- 0003: резолв игрового дня. Идемпотентно, целочисленная математика.

-- ---------- как считать правильный ответ ----------

create or replace function public.fn_question_answer(p_rule jsonb, p_match matches)
returns text
language sql
stable
as $$
  select case p_rule->>'type'
    when 'winner' then
      case
        when p_match.home_score is null or p_match.away_score is null then null
        when p_match.home_score > p_match.away_score then 'home'
        when p_match.home_score < p_match.away_score then 'away'
        else 'draw'
      end
    when 'total_over' then
      case
        when p_match.home_score is null or p_match.away_score is null then null
        when (p_match.home_score + p_match.away_score) > coalesce((p_rule->>'line')::numeric, 2.5) then 'yes'
        else 'no'
      end
    when 'btts' then
      case
        when p_match.home_score is null or p_match.away_score is null then null
        when p_match.home_score > 0 and p_match.away_score > 0 then 'yes'
        else 'no'
      end
    when 'team_total_over' then
      case
        when p_match.home_score is null or p_match.away_score is null then null
        when (case when p_rule->>'side' = 'away' then p_match.away_score else p_match.home_score end)
             >= coalesce((p_rule->>'line')::numeric, 2) then 'yes'
        else 'no'
      end
    when 'first_half_goal' then
      case
        when p_match.ht_home_score is null or p_match.ht_away_score is null then null
        when (p_match.ht_home_score + p_match.ht_away_score) > 0 then 'yes'
        else 'no'
      end
    when 'exact_score' then
      case
        when p_match.home_score is null or p_match.away_score is null then null
        when p_match.home_score > 4 or p_match.away_score > 4 then 'other'
        else p_match.home_score::text || ':' || p_match.away_score::text
      end
    else null
  end;
$$;

-- ---------- резолв дня ----------

create or replace function public.rpc_resolve_matchday(p_matchday uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_md matchdays;
  v_q integer := 0;
  v_player record;
  v_answered integer;
  v_correct integer;
  v_bonus boolean;
  v_tier dice_tier;
  v_awarded integer := 0;
begin
  select * into v_md from matchdays where id = p_matchday for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'MATCHDAY_NOT_FOUND');
  end if;

  if v_md.resolved_at is not null then
    return jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object('alreadyResolved', true, 'qTotal', v_md.q_total)
    );
  end if;

  -- 1. Отменённые и перенесённые матчи: вопрос аннулируется, из Q выпадает.
  update questions q
     set status = 'void', correct_option = null
    from matches m
   where q.match_id = m.id
     and q.matchday_id = p_matchday
     and m.status in ('PST','CANC','ABD')
     and q.status <> 'void';

  -- 2. Завершённые матчи: считаем правильный ответ.
  update questions q
     set correct_option = public.fn_question_answer(q.rule, m),
         status = 'resolved'
    from matches m
   where q.match_id = m.id
     and q.matchday_id = p_matchday
     and m.status = 'FT'
     and q.status in ('open','locked');

  update answers a
     set is_correct = (a.choice = q.correct_option)
    from questions q
   where a.question_id = q.id
     and q.matchday_id = p_matchday
     and q.status = 'resolved';

  -- 3. Q — число действительных обычных вопросов.
  select count(*) into v_q
    from questions
   where matchday_id = p_matchday
     and status = 'resolved'
     and is_bonus = false;

  -- 4. Кубики по игрокам.
  for v_player in
    select profile_id
      from season_players
     where season_id = v_md.season_id
       and is_active
     order by profile_id
  loop
    select
      count(*) filter (where a.question_id is not null),
      count(*) filter (where a.is_correct is true)
      into v_answered, v_correct
      from questions q
      left join answers a
        on a.question_id = q.id
       and a.profile_id = v_player.profile_id
     where q.matchday_id = p_matchday
       and q.status = 'resolved'
       and q.is_bonus = false;

    select exists (
      select 1
        from answers a
        join questions q on q.id = a.question_id
       where a.profile_id = v_player.profile_id
         and q.matchday_id = p_matchday
         and q.is_bonus = true
         and a.is_correct is true
    ) into v_bonus;

    -- Порог участия 80% и тиры: 3C >= 2Q → золото, 3C >= Q → серебро.
    if v_q > 0 and v_answered * 100 >= v_q * 80 then
      v_tier := case
        when v_correct * 3 >= v_q * 2 then 'gold'::dice_tier
        when v_correct * 3 >= v_q then 'silver'::dice_tier
        else 'bronze'::dice_tier
      end;

      insert into dice (season_id, profile_id, tier, sides, source, matchday_id)
      values (
        v_md.season_id,
        v_player.profile_id,
        v_tier,
        case v_tier when 'gold' then 6 when 'silver' then 4 when 'bronze' then 3 else 2 end,
        'matchday',
        p_matchday
      )
      on conflict do nothing;

      v_awarded := v_awarded + 1;

      if v_bonus then
        insert into dice (season_id, profile_id, tier, sides, source, matchday_id)
        values (v_md.season_id, v_player.profile_id, 'gold', 6, 'exact_score', p_matchday)
        on conflict do nothing;
      end if;
    end if;
  end loop;

  -- 5. Очки.
  insert into score_events (season_id, profile_id, kind, points, ref_table, ref_id)
  select v_md.season_id, a.profile_id, 'prediction_hit', 10, 'questions', q.id
    from answers a
    join questions q on q.id = a.question_id
   where q.matchday_id = p_matchday
     and q.status = 'resolved'
     and q.is_bonus = false
     and a.is_correct is true
  on conflict do nothing;

  insert into score_events (season_id, profile_id, kind, points, ref_table, ref_id)
  select v_md.season_id, a.profile_id, 'exact_score', 40, 'questions', q.id
    from answers a
    join questions q on q.id = a.question_id
   where q.matchday_id = p_matchday
     and q.status = 'resolved'
     and q.is_bonus = true
     and a.is_correct is true
  on conflict do nothing;

  -- 6. Закрываем день.
  update matchdays
     set status = 'closed', resolved_at = now(), q_total = v_q
   where id = p_matchday;

  insert into activity_log (season_id, kind, message, payload)
  values (
    v_md.season_id,
    'matchday_closed',
    format('Игровой день %s закрыт. Вопросов: %s', v_md.game_date, v_q),
    jsonb_build_object('matchday', p_matchday, 'qTotal', v_q)
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('qTotal', v_q, 'playersAwarded', v_awarded)
  );
end;
$$;

revoke all on function public.rpc_resolve_matchday(uuid) from public, anon, authenticated;
grant execute on function public.rpc_resolve_matchday(uuid) to service_role;

-- ---------- пересчёт дня ----------

create or replace function public.rpc_recalculate_matchday(
  p_matchday uuid,
  p_actor uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_md matchdays;
  v_spent integer;
  v_actor_role user_role;
begin
  select role into v_actor_role from profiles where id = p_actor;
  if v_actor_role is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select * into v_md from matchdays where id = p_matchday for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'MATCHDAY_NOT_FOUND');
  end if;

  select count(*) into v_spent
    from rolls r
    join dice d on d.id = r.dice_id
   where d.matchday_id = p_matchday;

  if v_spent > 0 then
    return jsonb_build_object('ok', false, 'code', 'RECALC_BLOCKED_DICE_SPENT');
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (p_actor, 'recalculate_matchday', 'matchdays', p_matchday::text,
          jsonb_build_object('resolved_at', v_md.resolved_at),
          jsonb_build_object('reason', p_reason));

  delete from score_events
   where season_id = v_md.season_id
     and ref_table = 'questions'
     and ref_id in (select id from questions where matchday_id = p_matchday);

  delete from dice where matchday_id = p_matchday;

  update answers a
     set is_correct = null
    from questions q
   where a.question_id = q.id and q.matchday_id = p_matchday;

  update matchdays
     set resolved_at = null, status = 'resolving', q_total = null
   where id = p_matchday;

  return public.rpc_resolve_matchday(p_matchday);
end;
$$;

revoke all on function public.rpc_recalculate_matchday(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.rpc_recalculate_matchday(uuid, uuid, text) to service_role;

-- ---------- админские правки ----------

create or replace function public.rpc_admin_set_position(
  p_season uuid,
  p_profile uuid,
  p_position integer,
  p_actor uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer;
  v_role user_role;
begin
  select role into v_role from profiles where id = p_actor;
  if v_role is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  if p_position < 1 or p_position > 80 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_POSITION');
  end if;

  select position into v_before
    from season_players
   where season_id = p_season and profile_id = p_profile
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_IN_SEASON');
  end if;

  update season_players
     set position = p_position
   where season_id = p_season and profile_id = p_profile;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (p_actor, 'set_position', 'season_players', p_profile::text,
          jsonb_build_object('position', v_before),
          jsonb_build_object('position', p_position, 'reason', p_reason));

  return jsonb_build_object('ok', true, 'data', jsonb_build_object('from', v_before, 'to', p_position));
end;
$$;

revoke all on function public.rpc_admin_set_position(uuid, uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.rpc_admin_set_position(uuid, uuid, integer, uuid, text) to service_role;

-- ---------- базовый конфиг ----------

insert into app_config (key, value) values
  ('scoring', jsonb_build_object(
    'prediction_hit', 10,
    'exact_score', 40,
    'cell_event', 5
  )),
  ('dice', jsonb_build_object(
    'participation_percent', 80,
    'gold_numerator', 2,
    'gold_denominator', 3,
    'silver_numerator', 1,
    'silver_denominator', 3,
    'catchup_per_season', 2
  )),
  ('board', jsonb_build_object(
    'total_cells', 80,
    'event_cells', 40,
    'safe_start', 5,
    'min_distinct_first_half', 8
  )),
  ('features', jsonb_build_object(
    'golevaya_para_once_per_day', false,
    'jgentlemen_once_per_day', false,
    'cards_enabled', false
  ))
on conflict (key) do nothing;
