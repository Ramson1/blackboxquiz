-- ============================================================================
-- 0013 — Public setup: re-enter a saved competition to review & edit it
--
-- Builds on 0012. Previously a setup link was single-use: after publishing,
-- re-entering the same link + password started a blank wizard and any second
-- submit raised "This setup link has already been used".
--
-- This migration makes the flow resumable and editable:
--   * `blackboxquiz_public_check_setup` now ALSO returns the saved competition
--     snapshot (title, both teams, time per question, every question + its
--     options/correct key) whenever the invite has already produced a
--     competition, together with an `editable` flag.
--   * `blackboxquiz_public_complete_setup` gains an UPDATE path: when the
--     invite already points at a competition that has NOT started
--     (status = 'READY'), the same call rewrites that competition in place
--     instead of raising. Once a run has begun (LIVE/PAUSED/COMPLETED/…) the
--     data is frozen and editing is refused so the event log stays truthful.
--
-- Both functions keep their original signatures, so the grants from 0012
-- still apply. Idempotent: safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Public: first gate of the setup wizard. On success also returns everything
-- needed to resume/edit a previously saved setup.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_public_check_setup(p_token text, p_password text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite public.blackboxquiz_setup_invites;
  v_org_name text;
  v_comp public.blackboxquiz_competitions;
  v_editable boolean := false;
  v_status text := null;
  v_setup jsonb := null;
begin
  v_invite := public.blackboxquiz_verify_invite_credentials(p_token, p_password);

  select name into v_org_name
  from public.blackboxquiz_organizations where id = v_invite.organization_id;

  -- Already published? Load the saved competition so the wizard can resume it.
  if v_invite.competition_id is not null then
    select * into v_comp
    from public.blackboxquiz_competitions
    where id = v_invite.competition_id;

    if found then
      v_status := v_comp.status;
      v_editable := (v_comp.status = 'READY');

      v_setup := jsonb_build_object(
        'title', v_comp.name,
        'timePerQuestion', v_comp.default_time_limit,
        'teamOne', (
          select t.name from public.blackboxquiz_teams t
          where t.competition_id = v_comp.id and t.display_order = 1
        ),
        'teamTwo', (
          select t.name from public.blackboxquiz_teams t
          where t.competition_id = v_comp.id and t.display_order = 2
        ),
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'question_text', q.question_text,
            'points', q.points,
            'point_color', q.point_color,
            'time_limit', q.time_limit,
            'category', q.category,
            'difficulty', q.difficulty,
            'explanation', q.explanation,
            'correct_key', (
              select o.option_key from public.blackboxquiz_question_options o
              where o.id = q.correct_option_id
            ),
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                'key', o.option_key,
                'text', o.option_text,
                'display_order', o.display_order
              ) order by o.display_order)
              from public.blackboxquiz_question_options o
              where o.question_id = q.id
            ), '[]'::jsonb)
          ) order by q.question_number)
          from public.blackboxquiz_questions q
          where q.competition_id = v_comp.id
        ), '[]'::jsonb)
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'organization_name', v_org_name,
    'used', (v_invite.competition_id is not null),
    'editable', v_editable,
    'status', v_status,
    'setup', v_setup
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Public: submit the setup. Creates a fresh competition when the invite is
-- still ACTIVE, or rewrites the existing (READY) competition when the invite
-- has already been used. Questions/options, teams and point tiers are rebuilt
-- from the payload so the stored board always matches the latest save.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_public_complete_setup(
  p_token text,
  p_password text,
  p_title text,
  p_team_one text,
  p_team_two text,
  p_time_per_question integer,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite public.blackboxquiz_setup_invites;
  v_error text;
  v_competition_id uuid;
  v_comp public.blackboxquiz_competitions;
  v_is_update boolean;
  v_slug text;
  v_candidate text;
  v_suffix int := 0;
  v_number integer := 1;
  v_row jsonb;
  v_points integer;
  v_time_limit integer;
  v_question_id uuid;
  v_option_id uuid;
  v_correct_id uuid;
  v_opt jsonb;
begin
  v_invite := public.blackboxquiz_verify_invite_credentials(p_token, p_password);

  -- ---- Shared validation ---------------------------------------------------
  if p_title is null or length(trim(p_title)) < 3 then
    raise exception 'Competition title must be at least 3 characters';
  end if;
  if length(trim(p_title)) > 200 then
    raise exception 'Competition title is too long (max 200 characters)';
  end if;
  if p_team_one is null or length(trim(p_team_one)) = 0
     or p_team_two is null or length(trim(p_team_two)) = 0
     or length(trim(p_team_one)) > 120 or length(trim(p_team_two)) > 120 then
    raise exception 'Both team names are required (max 120 characters each)';
  end if;
  if lower(trim(p_team_one)) = lower(trim(p_team_two)) then
    raise exception 'The two teams need different names';
  end if;
  if p_time_per_question is null or p_time_per_question < 5 or p_time_per_question > 600 then
    raise exception 'Time per question must be between 5 and 600 seconds';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array'
     or jsonb_array_length(p_questions) < 1 or jsonb_array_length(p_questions) > 200 then
    raise exception 'Between 1 and 200 questions are required';
  end if;

  v_is_update := (v_invite.competition_id is not null);

  if v_is_update then
    -- ---- UPDATE path: rewrite the existing, not-yet-started competition ----
    select * into v_comp
    from public.blackboxquiz_competitions
    where id = v_invite.competition_id
    for update;

    if not found then
      raise exception 'This setup link points to a competition that no longer exists';
    end if;
    if v_comp.status <> 'READY' then
      raise exception 'This competition has already started and can no longer be edited from the setup link';
    end if;

    v_competition_id := v_comp.id;

    -- Clear configurable children. question_options cascade from questions;
    -- the deferred correct_option FK is set null automatically on delete.
    update public.blackboxquiz_competitions
       set current_team_id = null, current_question_id = null
     where id = v_competition_id;
    delete from public.blackboxquiz_questions where competition_id = v_competition_id;
    delete from public.blackboxquiz_teams where competition_id = v_competition_id;
    delete from public.blackboxquiz_point_values where competition_id = v_competition_id;

    -- Rename with a collision-safe slug (ignoring this competition's own row).
    v_slug := trim(both '-' from lower(regexp_replace(trim(p_title), '[^a-zA-Z0-9]+', '-', 'g')));
    if v_slug = '' then v_slug := 'competition'; end if;
    v_suffix := 0;
    loop
      v_candidate := case when v_suffix = 0 then v_slug else v_slug || '-' || v_suffix end;
      exit when not exists (
        select 1 from public.blackboxquiz_competitions
        where slug = v_candidate and id <> v_competition_id
      );
      v_suffix := v_suffix + 1;
      if v_suffix > 50 then raise exception 'Could not generate a unique slug'; end if;
    end loop;

    update public.blackboxquiz_competitions
       set name = trim(p_title), slug = v_candidate,
           default_time_limit = p_time_per_question
     where id = v_competition_id;
  else
    -- ---- CREATE path (unchanged from 0012) --------------------------------
    if v_invite.status <> 'ACTIVE' then
      raise exception 'This setup link has already been used';
    end if;

    v_slug := trim(both '-' from lower(regexp_replace(trim(p_title), '[^a-zA-Z0-9]+', '-', 'g')));
    loop
      begin
        insert into public.blackboxquiz_competitions
          (organization_id, name, slug, description, status, timezone,
           default_time_limit, created_by)
        values
          (v_invite.organization_id, trim(p_title),
           case when v_suffix = 0 then v_slug else v_slug || '-' || v_suffix end,
           null, 'READY', 'UTC', p_time_per_question, null)
        returning id into v_competition_id;
        exit;
      exception when unique_violation then
        v_suffix := v_suffix + 1;
        if v_suffix > 50 then raise; end if;
      end;
    end loop;
  end if;

  -- ---- Shared seeding: point tiers, teams, questions -----------------------
  insert into public.blackboxquiz_point_values (competition_id, points, color, display_order) values
    (v_competition_id, 100,  '#16A34A', 1),
    (v_competition_id, 200,  '#2563EB', 2),
    (v_competition_id, 300,  '#EAB308', 3),
    (v_competition_id, 500,  '#F97316', 4),
    (v_competition_id, 1000, '#DC2626', 5);

  insert into public.blackboxquiz_teams
    (competition_id, name, color, display_order)
  values
    (v_competition_id, trim(p_team_one), '#2563EB', 1),
    (v_competition_id, trim(p_team_two), '#DC2626', 2);

  for v_row in select * from jsonb_array_elements(p_questions) loop
    v_points := nullif(v_row->>'points', '')::integer;
    v_time_limit := coalesce(nullif(v_row->>'time_limit', '')::integer, p_time_per_question);

    if v_points is null or v_points not in (100, 200, 300, 500, 1000) then
      raise exception 'Every question must be worth 100, 200, 300, 500 or 1000 points';
    end if;

    v_error := public.blackboxquiz_validate_question_payload(
      v_row->>'question_text', v_points, v_time_limit,
      v_row->'options', v_row->>'correct_key');
    if v_error is not null then
      raise exception 'Question %: %', v_number, v_error;
    end if;

    insert into public.blackboxquiz_questions
      (competition_id, question_number, question_text, category, difficulty,
       points, point_color, time_limit, explanation, status, display_order)
    values
      (v_competition_id, v_number, trim(v_row->>'question_text'),
       nullif(trim(coalesce(v_row->>'category', '')), ''),
       nullif(trim(coalesce(v_row->>'difficulty', '')), ''),
       v_points,
       coalesce(nullif(trim(coalesce(v_row->>'point_color', '')), ''), '#2563EB'),
       v_time_limit,
       nullif(trim(coalesce(v_row->>'explanation', '')), ''),
       'AVAILABLE', v_number)
    returning id into v_question_id;

    v_correct_id := null;
    for v_opt in select * from jsonb_array_elements(v_row->'options')
    loop
      insert into public.blackboxquiz_question_options
        (question_id, option_key, option_text, display_order)
      values
        (v_question_id, trim(v_opt->>'key'), trim(v_opt->>'text'),
         coalesce((v_opt->>'display_order')::int, 0))
      returning id into v_option_id;

      if trim(v_opt->>'key') = trim(v_row->>'correct_key') then
        v_correct_id := v_option_id;
      end if;
    end loop;

    update public.blackboxquiz_questions
    set correct_option_id = v_correct_id where id = v_question_id;

    v_number := v_number + 1;
  end loop;

  -- ---- Invite bookkeeping + audit -----------------------------------------
  if v_is_update then
    insert into public.blackboxquiz_audit_logs
      (organization_id, competition_id, user_id, action, entity_type, entity_id, new_value)
    values
      (v_invite.organization_id, v_competition_id, null, 'COMPETITION_UPDATED',
       'competition', v_competition_id,
       jsonb_build_object('name', trim(p_title), 'via', 'public_setup_edit'));
  else
    update public.blackboxquiz_setup_invites
       set competition_id = v_competition_id, status = 'USED', used_at = now()
     where id = v_invite.id;

    insert into public.blackboxquiz_audit_logs
      (organization_id, competition_id, user_id, action, entity_type, entity_id, new_value)
    values
      (v_invite.organization_id, v_competition_id, null, 'COMPETITION_CREATED',
       'competition', v_competition_id, jsonb_build_object('name', trim(p_title), 'via', 'public_setup')),
      (v_invite.organization_id, v_competition_id, null, 'SETUP_INVITE_USED',
       'setup_invite', v_invite.id, jsonb_build_object('title', trim(p_title)));
  end if;

  return jsonb_build_object('competition_id', v_competition_id, 'question_count', v_number - 1);
end;
$$;
