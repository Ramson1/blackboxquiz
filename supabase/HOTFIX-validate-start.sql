-- ============================================================================
-- BLACKBOX QUIZ HOTFIX — fixes 'malformed array literal' in start validation
-- Paste this ENTIRE file into the Supabase Dashboard SQL editor and Run.
-- Idempotent (create or replace). Safe to run as many times as needed.
-- ============================================================================

create or replace function public.blackboxquiz_validate_competition_start(p_competition_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  comp record;
  v_teams int;
  v_nameless int;
  v_questions int;
  v_bad_options int;
  v_no_answer int;
  v_bad_points int;
  v_locked boolean;
  v_issues text[] := array[]::text[];
begin
  select * into comp from public.blackboxquiz_competitions where id = p_competition_id;
  if not found then
    return jsonb_build_object('ok', false,
      'issues', jsonb_build_array('Competition does not exist'));
  end if;

  if comp.status not in ('READY', 'DOWNLOADED') then
    v_issues := v_issues || ('Competition is not READY (current: ' || comp.status || ')');
  end if;

  select count(*), count(*) filter (where length(trim(name)) = 0)
    into v_teams, v_nameless
  from public.blackboxquiz_teams where competition_id = p_competition_id;
  if v_teams <> 2 then
    v_issues := v_issues || ('Exactly 2 teams required (found ' || v_teams || ')');
  end if;
  if v_nameless > 0 then
    v_issues := v_issues || ARRAY['Every team must have a name'];
  end if;

  select count(*) into v_questions
  from public.blackboxquiz_questions where competition_id = p_competition_id;
  if v_questions = 0 then
    v_issues := v_issues || ARRAY['No questions uploaded'];
  end if;

  select count(*) into v_bad_options
  from public.blackboxquiz_questions q
  where q.competition_id = p_competition_id
    and (select count(*) from public.blackboxquiz_question_options o
         where o.question_id = q.id) < 2;
  if v_bad_options > 0 then
    v_issues := v_issues || (v_bad_options || ' question(s) missing answer options');
  end if;

  select count(*) into v_no_answer
  from public.blackboxquiz_questions q
  where q.competition_id = p_competition_id
    and q.correct_option_id is null;
  if v_no_answer > 0 then
    v_issues := v_issues || (v_no_answer || ' question(s) without a correct answer');
  end if;

  select count(*) into v_bad_points
  from public.blackboxquiz_questions q
  where q.competition_id = p_competition_id
    and not exists (select 1 from public.blackboxquiz_point_values pv
                    where pv.competition_id = q.competition_id
                      and pv.points = q.points);
  if v_bad_points > 0 then
    v_issues := v_issues || (v_bad_points || ' question(s) use an undefined point value');
  end if;

  if comp.default_time_limit is null or comp.default_time_limit <= 0 then
    v_issues := v_issues || ARRAY['Timer configuration is invalid'];
  end if;

  select exists (
    select 1 from public.blackboxquiz_competition_locks
    where competition_id = p_competition_id and locked = true
  ) into v_locked;
  if v_locked then
    v_issues := v_issues || ARRAY['Competition is locked'];
  end if;

  return jsonb_build_object(
    'ok', cardinality(v_issues) = 0,
    'issues', to_jsonb(v_issues)
  );
end;
$$;

grant execute on function public.blackboxquiz_validate_competition_start(uuid) to authenticated;
