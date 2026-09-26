-- ============================================================================
-- BLACKBOX QUIZ — Question management RPCs (spec §45, §46, §47, §48)
-- Every mutation validates server-side and enforces competition-scoped
-- permissions. The client may preview/validate, but the database is authority:
-- invalid records are never imported (spec §46/§47).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: the next question_number for a competition.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_next_question_number(p_competition_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(max(question_number), 0) + 1
  from public.blackboxquiz_questions
  where competition_id = p_competition_id;
$$;

-- ----------------------------------------------------------------------------
-- Internal: validate a single normalized question + options payload.
-- Returns null when valid, otherwise a human-readable reason.
-- p_options: jsonb array of { "key": "A", "text": "..." }
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_validate_question_payload(
  p_question_text text,
  p_points integer,
  p_time_limit integer,
  p_options jsonb,
  p_correct_key text
)
returns text
language plpgsql
immutable
as $$
declare
  v_opt jsonb;
  v_count integer := 0;
  v_found_correct boolean := false;
begin
  if p_question_text is null or length(trim(p_question_text)) = 0 then
    return 'Question text is empty';
  end if;
  if p_points is null or p_points <= 0 then
    return 'Points must be a positive number';
  end if;
  if p_time_limit is null or p_time_limit <= 0 then
    return 'Time limit must be a positive number of seconds';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 then
    return 'At least two answer options are required';
  end if;

  for v_opt in select * from jsonb_array_elements(p_options)
  loop
    v_count := v_count + 1;
    if v_opt->>'key' is null or length(trim(v_opt->>'key')) = 0 then
      return 'Every option must have a key';
    end if;
    if v_opt->>'text' is null or length(trim(v_opt->>'text')) = 0 then
      return 'Every option must have text';
    end if;
    if trim(coalesce(v_opt->>'key', '')) = trim(coalesce(p_correct_key, '')) then
      v_found_correct := true;
    end if;
  end loop;

  if not v_found_correct then
    return 'Correct answer does not match any option';
  end if;
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- create_question — manual single creation (spec §45).
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_create_question(
  p_competition_id uuid,
  p_question_text text,
  p_options jsonb,
  p_correct_key text,
  p_points integer,
  p_category text default null,
  p_difficulty text default null,
  p_point_color text default null,
  p_time_limit integer default 30,
  p_explanation text default null,
  p_image_url text default null,
  p_audio_url text default null,
  p_video_url text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_error text;
  v_question_id uuid;
  v_option_id uuid;
  v_correct_id uuid;
  v_number integer;
  v_opt jsonb;
begin
  if not public.blackboxquiz_can_manage_competition(p_competition_id) then
    raise exception 'Not permitted to manage questions for this competition';
  end if;

  v_error := public.blackboxquiz_validate_question_payload(
    p_question_text, p_points, p_time_limit, p_options, p_correct_key);
  if v_error is not null then
    raise exception '%', v_error;
  end if;

  v_number := public.blackboxquiz_next_question_number(p_competition_id);

  insert into public.blackboxquiz_questions
    (competition_id, question_number, question_text, category, difficulty,
     points, point_color, time_limit, explanation, image_url, audio_url,
     video_url, status, display_order)
  values
    (p_competition_id, v_number, trim(p_question_text),
     nullif(trim(coalesce(p_category, '')), ''),
     nullif(trim(coalesce(p_difficulty, '')), ''),
     p_points,
     coalesce(nullif(trim(coalesce(p_point_color, '')), ''), '#2563EB'),
     p_time_limit,
     nullif(trim(coalesce(p_explanation, '')), ''),
     nullif(p_image_url, ''), nullif(p_audio_url, ''), nullif(p_video_url, ''),
     'AVAILABLE', v_number)
  returning id into v_question_id;

  for v_opt in select * from jsonb_array_elements(p_options)
  loop
    insert into public.blackboxquiz_question_options
      (question_id, option_key, option_text, image_url, display_order)
    values
      (v_question_id, trim(v_opt->>'key'), trim(v_opt->>'text'),
       nullif(v_opt->>'image_url', ''),
       (v_opt->>'display_order')::int)
    returning id into v_option_id;

    if trim(v_opt->>'key') = trim(p_correct_key) then
      v_correct_id := v_option_id;
    end if;
  end loop;

  update public.blackboxquiz_questions
  set correct_option_id = v_correct_id
  where id = v_question_id;

  return v_question_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- update_question — edits an AVAILABLE question only (never mid-live).
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_update_question(
  p_question_id uuid,
  p_question_text text,
  p_options jsonb,
  p_correct_key text,
  p_points integer,
  p_category text default null,
  p_difficulty text default null,
  p_point_color text default null,
  p_time_limit integer default 30,
  p_explanation text default null,
  p_image_url text default null,
  p_audio_url text default null,
  p_video_url text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_competition_id uuid;
  v_status text;
  v_error text;
  v_option_id uuid;
  v_correct_id uuid;
  v_opt jsonb;
begin
  select competition_id, status
    into v_competition_id, v_status
  from public.blackboxquiz_questions
  where id = p_question_id;

  if v_competition_id is null then
    raise exception 'Question not found';
  end if;
  if v_status <> 'AVAILABLE' then
    raise exception 'Only available (unused) questions can be edited';
  end if;
  if not public.blackboxquiz_can_manage_competition(v_competition_id) then
    raise exception 'Not permitted to manage questions for this competition';
  end if;

  v_error := public.blackboxquiz_validate_question_payload(
    p_question_text, p_points, p_time_limit, p_options, p_correct_key);
  if v_error is not null then
    raise exception '%', v_error;
  end if;

  update public.blackboxquiz_questions
  set question_text = trim(p_question_text),
      category = nullif(trim(coalesce(p_category, '')), ''),
      difficulty = nullif(trim(coalesce(p_difficulty, '')), ''),
      points = p_points,
      point_color = coalesce(nullif(trim(coalesce(p_point_color, '')), ''), point_color),
      time_limit = p_time_limit,
      explanation = nullif(trim(coalesce(p_explanation, '')), ''),
      image_url = nullif(p_image_url, ''),
      audio_url = nullif(p_audio_url, ''),
      video_url = nullif(p_video_url, ''),
      correct_option_id = null
  where id = p_question_id;

  delete from public.blackboxquiz_question_options where question_id = p_question_id;

  for v_opt in select * from jsonb_array_elements(p_options)
  loop
    insert into public.blackboxquiz_question_options
      (question_id, option_key, option_text, image_url, display_order)
    values
      (p_question_id, trim(v_opt->>'key'), trim(v_opt->>'text'),
       nullif(v_opt->>'image_url', ''),
       (v_opt->>'display_order')::int)
    returning id into v_option_id;

    if trim(v_opt->>'key') = trim(p_correct_key) then
      v_correct_id := v_option_id;
    end if;
  end loop;

  update public.blackboxquiz_questions
  set correct_option_id = v_correct_id
  where id = p_question_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- delete_question — only AVAILABLE questions may be deleted.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_delete_question(p_question_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_competition_id uuid;
  v_status text;
begin
  select competition_id, status into v_competition_id, v_status
  from public.blackboxquiz_questions where id = p_question_id;

  if v_competition_id is null then
    raise exception 'Question not found';
  end if;
  if v_status <> 'AVAILABLE' then
    raise exception 'Only available (unused) questions can be deleted';
  end if;
  if not public.blackboxquiz_can_manage_competition(v_competition_id) then
    raise exception 'Not permitted to manage questions for this competition';
  end if;

  delete from public.blackboxquiz_questions where id = p_question_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- duplicate_question — clones a question + its options as a new AVAILABLE row.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_duplicate_question(p_question_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  src public.blackboxquiz_questions%rowtype;
  v_new_id uuid;
  v_number integer;
  v_old_correct_key text;
  v_new_correct_id uuid;
  v_opt public.blackboxquiz_question_options%rowtype;
begin
  select * into src from public.blackboxquiz_questions where id = p_question_id;
  if src.id is null then
    raise exception 'Question not found';
  end if;
  if not public.blackboxquiz_can_manage_competition(src.competition_id) then
    raise exception 'Not permitted to manage questions for this competition';
  end if;

  select option_key into v_old_correct_key
  from public.blackboxquiz_question_options
  where id = src.correct_option_id;

  v_number := public.blackboxquiz_next_question_number(src.competition_id);

  insert into public.blackboxquiz_questions
    (competition_id, question_number, question_text, category, difficulty,
     points, point_color, time_limit, explanation, image_url, audio_url,
     video_url, status, display_order)
  values
    (src.competition_id, v_number, src.question_text, src.category,
     src.difficulty, src.points, src.point_color, src.time_limit,
     src.explanation, src.image_url, src.audio_url, src.video_url,
     'AVAILABLE', v_number)
  returning id into v_new_id;

  for v_opt in
    select * from public.blackboxquiz_question_options
    where question_id = p_question_id order by display_order
  loop
    insert into public.blackboxquiz_question_options
      (question_id, option_key, option_text, image_url, display_order)
    values (v_new_id, v_opt.option_key, v_opt.option_text, v_opt.image_url,
            v_opt.display_order)
    returning id into v_new_correct_id;

    if v_opt.option_key = v_old_correct_key then
      update public.blackboxquiz_questions
      set correct_option_id = v_new_correct_id
      where id = v_new_id;
    end if;
  end loop;

  return v_new_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- bulk_import_questions — imports an array of normalized rows (spec §46/§47).
-- Invalid rows are rejected (never imported); valid rows are inserted.
-- Returns { imported, rejected, errors:[{ row, reason }] }.
-- p_rows: jsonb array of {
--   question_text, category, difficulty, points, time_limit, explanation,
--   options:[{key,text}], correct_key }
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_bulk_import_questions(
  p_competition_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_row jsonb;
  v_ordinal integer := 0;
  v_error text;
  v_imported integer := 0;
  v_rejected integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_question_id uuid;
  v_option_id uuid;
  v_correct_id uuid;
  v_number integer;
  v_opt jsonb;
  v_points integer;
  v_time_limit integer;
begin
  if not public.blackboxquiz_can_manage_competition(p_competition_id) then
    raise exception 'Not permitted to manage questions for this competition';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a jsonb array';
  end if;

  v_number := public.blackboxquiz_next_question_number(p_competition_id);

  for v_ordinal, v_row in
    select row_number() over (), value from jsonb_array_elements(p_rows)
  loop
    v_points := nullif(v_row->>'points', '')::integer;
    v_time_limit := coalesce(nullif(v_row->>'time_limit', '')::integer, 30);

    v_error := public.blackboxquiz_validate_question_payload(
      v_row->>'question_text', v_points, v_time_limit,
      v_row->'options', v_row->>'correct_key');

    if v_error is not null then
      v_rejected := v_rejected + 1;
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('row', v_ordinal, 'reason', v_error));
      continue;
    end if;

    insert into public.blackboxquiz_questions
      (competition_id, question_number, question_text, category, difficulty,
       points, point_color, time_limit, explanation, status, display_order)
    values
      (p_competition_id, v_number, trim(v_row->>'question_text'),
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

    v_imported := v_imported + 1;
    v_number := v_number + 1;
  end loop;

  return jsonb_build_object(
    'imported', v_imported,
    'rejected', v_rejected,
    'errors', v_errors
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants: authenticated users may execute; the functions self-enforce scope.
-- ----------------------------------------------------------------------------
grant execute on function public.blackboxquiz_next_question_number(uuid) to authenticated;
grant execute on function public.blackboxquiz_create_question(uuid, text, jsonb, text, integer, text, text, text, integer, text, text, text, text) to authenticated;
grant execute on function public.blackboxquiz_update_question(uuid, text, jsonb, text, integer, text, text, text, integer, text, text, text, text) to authenticated;
grant execute on function public.blackboxquiz_delete_question(uuid) to authenticated;
grant execute on function public.blackboxquiz_duplicate_question(uuid) to authenticated;
grant execute on function public.blackboxquiz_bulk_import_questions(uuid, jsonb) to authenticated;
