-- 0006: правила выдачи кубиков — без порога 80%, минимум деревянный кубик.
--
-- Кубик за день получает каждый активный игрок сезона (если есть вопросы дня),
-- даже без ответов и без угаданных: 0 верных -> деревянный.
-- Тиры по верным ответам: 3C >= 2Q — золотой, 3C >= Q — серебряный, иначе бронзовый.

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

  -- 1. Аннулируем вопросы переносных/отменённых матчей.
  update questions q
     set status = 'void', correct_option = null
    from matches m
   where q.match_id = m.id
     and q.matchday_id = p_matchday
     and m.status in ('PST','CANC','ABD')
     and q.status <> 'void';

  -- 2. Закрываем и считаем правильные ответы.
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

  -- 3. Q — число засчитанных (обычных) вопросов.
  select count(*) into v_q
    from questions
   where matchday_id = p_matchday
     and status = 'resolved'
     and is_bonus = false;

  -- 4. Кубики: без порога участия, минимум деревянный.
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

    if v_q > 0 then
      v_tier := case
        when v_correct <= 0 then 'wood'::dice_tier
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

  -- 6. Закрыть день.
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

-- Обновить конфиг (информативно).
update app_config
   set value = jsonb_set(coalesce(value, '{}'::jsonb), '{participation_percent}', '0'::jsonb, true)
 where key = 'dice';
