-- 0004: лок вопроса следует за временем матча (DECISIONS D10)
--
-- `questions.locks_at` — кэш, источник истины — `matches.kickoff_utc`.
-- Перенос матча «вперёд» должен сразу закрыть приём ответов, иначе игрок
-- ответит после старта. Триггер обновляет кэш при любом изменении времени.

create or replace function public.sync_question_locks_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kickoff_utc is distinct from old.kickoff_utc then
    update questions
       set locks_at = new.kickoff_utc
     where match_id = new.id
       and status in ('open', 'locked')
       and locks_at is distinct from new.kickoff_utc;
  end if;
  return new;
end;
$$;

drop trigger if exists matches_sync_question_locks on matches;
create trigger matches_sync_question_locks
  after update of kickoff_utc on matches
  for each row execute function public.sync_question_locks_at();
