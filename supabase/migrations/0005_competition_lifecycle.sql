-- ============================================================================
-- BLACKBOX QUIZ — Competition lifecycle RPCs (spec §11, §12, §70, §73)
-- All sensitive state transitions happen server-side; the client can never
-- move a competition to an illegal state.
-- ============================================================================

create or replace function public.blackboxquiz_allowed_next_status(p_status text)
returns text[]
language sql
immutable
as $$
  select case p_status
    when 'DRAFT'       then array['SETUP']
    when 'SETUP'       then array['READY', 'DRAFT']
    when 'READY'       then array['DOWNLOADING', 'SETUP']
    when 'DOWNLOADING' then array['DOWNLOADED', 'READY']
    when 'DOWNLOADED'  then array['LIVE', 'READY']
    when 'LIVE'        then array['PAUSED', 'COMPLETED']
    when 'PAUSED'      then array['LIVE', 'COMPLETED']
    when 'COMPLETED'   then array['ARCHIVED']
    else array[]::text[]
  end;
$$;

-- ----------------------------------------------------------------------------
-- create_competition: permissions checked server-side; seeds the five default
-- point values (editable afterwards — spec §15 forbids hard-coding in the UI).
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_create_competition(
  p_organization_id uuid,
  p_name text,
  p_description text default null,
  p_scheduled_at timestamptz default null,
  p_timezone text default 'UTC',
  p_default_time_limit integer default 30
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_slug text;
  v_suffix int := 0;
begin
  if p_name is null or length(trim(p_name)) < 3 then
    raise exception 'Competition name must be at least 3 characters';
  end if;
  if p_default_time_limit is null or p_default_time_limit <= 0 then
    raise exception 'Default time limit must be positive';
  end if;
  if not (
    public.blackboxquiz_is_super_admin()
    or public.blackboxquiz_org_role(p_organization_id) = 'ORGANIZATION_ADMIN'
  ) then
    raise exception 'Not permitted to create competitions for this organization';
  end if;

  v_slug := trim(both '-' from lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')));
  loop
    begin
      insert into public.blackboxquiz_competitions
        (organization_id, name, slug, description, status, scheduled_at,
         timezone, default_time_limit, created_by)
      values
        (p_organization_id, trim(p_name),
         case when v_suffix = 0 then v_slug else v_slug || '-' || v_suffix end,
         nullif(trim(coalesce(p_description, '')), ''), 'DRAFT', p_scheduled_at,
         coalesce(p_timezone, 'UTC'), p_default_time_limit, auth.uid())
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_suffix := v_suffix + 1;
      if v_suffix > 50 then raise; end if;
    end;
  end loop;

  insert into public.blackboxquiz_point_values (competition_id, points, color, display_order) values
    (v_id, 100,  '#16A34A', 1),
    (v_id, 200,  '#2563EB', 2),
    (v_id, 300,  '#EAB308', 3),
    (v_id, 500,  '#F97316', 4),
    (v_id, 1000, '#DC2626', 5);

  insert into public.blackboxquiz_audit_logs
    (organization_id, competition_id, user_id, action, entity_type, entity_id, new_value)
  values
    (p_organization_id, v_id, auth.uid(), 'COMPETITION_CREATED', 'competition', v_id,
     jsonb_build_object('name', trim(p_name)));

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Status transitions (DRAFT → … → ARCHIVED). Illegal transitions rejected.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_set_competition_status(
  p_competition_id uuid,
  p_new_status text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
  v_status text;
begin
  select organization_id, status into v_org, v_status
  from public.blackboxquiz_competitions where id = p_competition_id;
  if not found then
    raise exception 'Competition not found';
  end if;
  if not public.blackboxquiz_can_manage_competition(p_competition_id) then
    raise exception 'Not permitted to change this competition';
  end if;
  if not p_new_status = any (public.blackboxquiz_allowed_next_status(v_status)) then
    raise exception 'Illegal transition % -> %', v_status, p_new_status;
  end if;

  update public.blackboxquiz_competitions
     set status = p_new_status,
         completed_at = case when p_new_status = 'COMPLETED' then now() else completed_at end
   where id = p_competition_id;

  insert into public.blackboxquiz_audit_logs
    (organization_id, competition_id, user_id, action, entity_type, entity_id,
     old_value, new_value)
  values
    (v_org, p_competition_id, auth.uid(), 'COMPETITION_STATUS_' || p_new_status,
     'competition', p_competition_id,
     jsonb_build_object('status', v_status), jsonb_build_object('status', p_new_status));
end;
$$;

-- ----------------------------------------------------------------------------
-- Lock / unlock (spec §54, §63). Locking works from any operational state and
-- blocks start/continue; unlocking releases the recorded lock.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_lock_competition(
  p_competition_id uuid,
  p_reason text default 'Locked by administrator'
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org
  from public.blackboxquiz_competitions where id = p_competition_id;
  if not found then
    raise exception 'Competition not found';
  end if;
  if not public.blackboxquiz_can_manage_competition(p_competition_id) then
    raise exception 'Not permitted to lock this competition';
  end if;

  update public.blackboxquiz_competition_locks
     set locked = false, released_at = now()
   where competition_id = p_competition_id and locked = true;

  insert into public.blackboxquiz_competition_locks
    (competition_id, locked, reason, locked_by)
  values (p_competition_id, true, p_reason, auth.uid());

  insert into public.blackboxquiz_audit_logs
    (organization_id, competition_id, user_id, action, entity_type, entity_id, new_value)
  values
    (v_org, p_competition_id, auth.uid(), 'COMPETITION_LOCKED', 'competition',
     p_competition_id, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.blackboxquiz_unlock_competition(p_competition_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org
  from public.blackboxquiz_competitions where id = p_competition_id;
  if not found then
    raise exception 'Competition not found';
  end if;
  if not public.blackboxquiz_can_manage_competition(p_competition_id) then
    raise exception 'Not permitted to unlock this competition';
  end if;

  update public.blackboxquiz_competition_locks
     set locked = false, released_at = now()
   where competition_id = p_competition_id and locked = true;

  insert into public.blackboxquiz_audit_logs
    (organization_id, competition_id, user_id, action, entity_type, entity_id)
  values
    (v_org, p_competition_id, auth.uid(), 'COMPETITION_UNLOCKED', 'competition',
     p_competition_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- Start validation (spec §73). Returns { ok, issues: [ ... ] }.
-- ----------------------------------------------------------------------------
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
    v_issues := v_issues || 'Every team must have a name';
  end if;

  select count(*) into v_questions
  from public.blackboxquiz_questions where competition_id = p_competition_id;
  if v_questions = 0 then
    v_issues := v_issues || 'No questions uploaded';
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
    v_issues := v_issues || 'Timer configuration is invalid';
  end if;

  select exists (
    select 1 from public.blackboxquiz_competition_locks
    where competition_id = p_competition_id and locked = true
  ) into v_locked;
  if v_locked then
    v_issues := v_issues || 'Competition is locked';
  end if;

  return jsonb_build_object(
    'ok', cardinality(v_issues) = 0,
    'issues', to_jsonb(v_issues)
  );
end;
$$;

grant execute on function public.blackboxquiz_validate_competition_start(uuid) to authenticated;
grant execute on function public.blackboxquiz_lock_competition(uuid, text) to authenticated;
grant execute on function public.blackboxquiz_unlock_competition(uuid) to authenticated;
grant execute on function public.blackboxquiz_set_competition_status(uuid, text) to authenticated;
grant execute on function public.blackboxquiz_create_competition(uuid, text, text, timestamptz, text, integer) to authenticated;
