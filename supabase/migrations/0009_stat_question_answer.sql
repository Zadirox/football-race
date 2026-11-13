-- 0009: оценка новых вопросов по статистике матча (угловые, карточки, владение, удары в створ).

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

    when 'corners_total_over' then
      case
        when p_match.corners_home is null or p_match.corners_away is null then null
        when (p_match.corners_home + p_match.corners_away) > coalesce((p_rule->>'line')::numeric, 8.5) then 'yes'
        else 'no'
      end
    when 'corners_more' then
      case
        when p_match.corners_home is null or p_match.corners_away is null then null
        when p_match.corners_home > p_match.corners_away then 'home'
        when p_match.corners_home < p_match.corners_away then 'away'
        else 'draw'
      end
    when 'red_card' then
      case
        when p_match.red_cards_home is null or p_match.red_cards_away is null then null
        when (p_match.red_cards_home + p_match.red_cards_away) > 0 then 'yes'
        else 'no'
      end
    when 'yellow_cards_total_over' then
      case
        when p_match.yellow_cards_home is null or p_match.yellow_cards_away is null then null
        when (p_match.yellow_cards_home + p_match.yellow_cards_away) > coalesce((p_rule->>'line')::numeric, 3.5) then 'yes'
        else 'no'
      end
    when 'possession_more' then
      case
        when p_match.possession_home is null or p_match.possession_away is null then null
        when p_match.possession_home > p_match.possession_away then 'home'
        when p_match.possession_home < p_match.possession_away then 'away'
        else null
      end
    when 'shots_on_target_more' then
      case
        when p_match.shots_on_target_home is null or p_match.shots_on_target_away is null then null
        when p_match.shots_on_target_home > p_match.shots_on_target_away then 'home'
        when p_match.shots_on_target_home < p_match.shots_on_target_away then 'away'
        else 'draw'
      end
    when 'shots_on_target_total_over' then
      case
        when p_match.shots_on_target_home is null or p_match.shots_on_target_away is null then null
        when (p_match.shots_on_target_home + p_match.shots_on_target_away) > coalesce((p_rule->>'line')::numeric, 8.5) then 'yes'
        else 'no'
      end

    else null
  end;
$$;
