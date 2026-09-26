-- ============================================================================
-- 0007 — Live scoring projection (spec §19, §21, §28, §51, §56)
--
-- The append-only event log stays the source of truth; this maintains a
-- materialized scoreboard + question/competition projection so dashboards, the
-- live monitor and exports can read current scores without replaying events.
--
-- SECURITY DEFINER: an operator (a competition *member*) may record events but
-- does not have direct write access to teams/questions (managers only). The
-- trigger therefore applies the derived updates as the function owner. Scoring
-- is idempotent because each event row inserts exactly once (append-only +
-- unique(competition_id, device_id, sequence_number)); no points are awarded
-- twice (§38).
-- ============================================================================

create or replace function public.blackboxquiz_apply_event_projection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_q    uuid;
  v_res  text;
  v_pts  integer;
begin
  v_res := nullif(NEW.payload ->> 'result', '');
  v_pts := coalesce(nullif(NEW.payload ->> 'points', '')::integer, 0);

  if NEW.event_type = 'QUESTION_SELECTED' then
    v_q    := (NEW.payload ->> 'questionId')::uuid;
    v_team := nullif(NEW.payload ->> 'teamId', '')::uuid;
    update public.blackboxquiz_questions set status = 'SELECTED' where id = v_q;
    update public.blackboxquiz_competitions
       set current_question_id = v_q, current_team_id = v_team
     where id = NEW.competition_id;

  elsif NEW.event_type = 'QUESTION_STARTED' then
    if NEW.payload ? 'questionId' then
      update public.blackboxquiz_questions set status = 'ANSWERING'
        where id = (NEW.payload ->> 'questionId')::uuid;
    end if;

  elsif NEW.event_type = 'BONUS_STARTED' then
    if NEW.payload ? 'questionId' then
      update public.blackboxquiz_questions set status = 'BONUS_ANSWERING'
        where id = (NEW.payload ->> 'questionId')::uuid;
    end if;

  elsif NEW.event_type in ('ANSWER_SUBMITTED', 'BONUS_ANSWER_SUBMITTED') then
    v_q := nullif(NEW.payload ->> 'questionId', '')::uuid;
    if v_res = 'CORRECT' then
      -- Award the point value once, to the answering team (§19/§21).
      v_team := (NEW.payload ->> 'teamId')::uuid;
      update public.blackboxquiz_teams
         set current_score = current_score + v_pts
       where id = v_team;
      if v_q is not null then
        update public.blackboxquiz_questions set status = 'COMPLETED' where id = v_q;
      end if;
    elsif NEW.event_type = 'ANSWER_SUBMITTED' then
      -- Primary failed → question enters FAILED (bonus may follow) (§20/§23).
      if v_q is not null then
        update public.blackboxquiz_questions set status = 'FAILED' where id = v_q;
      end if;
    else
      -- Bonus also failed → no points, reveal, complete (§22/§24).
      if v_q is not null then
        update public.blackboxquiz_questions set status = 'COMPLETED' where id = v_q;
      end if;
    end if;

  elsif NEW.event_type = 'QUESTION_COMPLETED' then
    if NEW.payload ? 'questionId' then
      update public.blackboxquiz_questions set status = 'COMPLETED'
        where id = (NEW.payload ->> 'questionId')::uuid;
    end if;

  elsif NEW.event_type = 'SCORE_ADJUSTED' then
    -- Manual, audited adjustment (§56).
    v_team := nullif(NEW.payload ->> 'teamId', '')::uuid;
    update public.blackboxquiz_teams
       set current_score = current_score
         + coalesce(nullif(NEW.payload ->> 'adjustment', '')::integer, 0)
     where id = v_team;

  elsif NEW.event_type = 'COMPETITION_COMPLETED' then
    update public.blackboxquiz_competitions
       set status = 'COMPLETED', completed_at = now()
     where id = NEW.competition_id;
  end if;

  return NEW;
end;
$$;

create or replace trigger trg_blackboxquiz_apply_event_projection
  after insert on public.blackboxquiz_competition_events
  for each row execute function public.blackboxquiz_apply_event_projection();

revoke execute on function public.blackboxquiz_apply_event_projection() from public, anon, authenticated;
