-- Allow system grading of answers after a question is locked.
-- The resolve flow updates answers.is_correct once questions are past locks_at;
-- the previous trigger blocked any answer update after lock, causing
-- rpc_resolve_matchday to fail with QUESTION_LOCKED. Player inserts/updates to
-- their chosen answer remain blocked after lock.

create or replace function public.prevent_answer_after_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock timestamptz;
begin
  select locks_at into v_lock from questions where id = new.question_id;
  if v_lock is null then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  if now() >= v_lock then
    -- Permit resolve/recalculation to set is_correct without changing the answer.
    if tg_op = 'UPDATE'
       and new.choice is not distinct from old.choice
       and new.question_id is not distinct from old.question_id
       and new.profile_id is not distinct from old.profile_id
    then
      return new;
    end if;

    raise exception 'QUESTION_LOCKED';
  end if;

  return new;
end;
$$;
