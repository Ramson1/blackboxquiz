-- ============================================================================
-- 0012 — Public setup invites + public competition flow (anon-safe)
--
-- Lets a super admin issue a setup LINK (/setup/<token>) + PASSWORD so a
-- non-authenticated user can configure a two-team competition, and so the
-- competition can later be started publicly from the home screen with the
-- title + the same password.
--
-- SECURITY MODEL: anon has zero table access (all RLS policies are
-- `to authenticated`). Every public operation runs through SECURITY DEFINER
-- functions that verify the invite token / bcrypt password themselves and
-- throttle brute force on the invite row. No service-role key anywhere.
--
-- Idempotent: safe to paste into the Supabase SQL editor repeatedly.
-- Prereq: migrations 0001–0011 (see APPLY-ALL.sql) + HOTFIX-validate-start.sql
-- already applied. Sanity check:
--   select proname from pg_proc where proname = 'blackboxquiz_create_competition';
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: one row per admin-issued setup invite. Passwords are stored ONLY as
-- bcrypt hashes (pgcrypto crypt/gen_salt); the plaintext is returned once.
-- ----------------------------------------------------------------------------
create table if not exists public.blackboxquiz_setup_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.blackboxquiz_organizations (id) on delete cascade,
  token           text not null unique,
  password_hash   text not null,
  label           text,
  competition_id  uuid references public.blackboxquiz_competitions (id) on delete set null,
  status          text not null default 'ACTIVE'
                  check (status in ('ACTIVE', 'USED', 'REVOKED')),
  attempt_count   integer not null default 0,
  locked_until    timestamptz,
  expires_at      timestamptz,
  created_by      uuid references public.blackboxquiz_profiles (id),
  used_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_blackboxquiz_setup_invites_org
  on public.blackboxquiz_setup_invites (organization_id, created_at desc);
create index if not exists idx_blackboxquiz_setup_invites_competition
  on public.blackboxquiz_setup_invites (competition_id);

create or replace trigger trg_blackboxquiz_setup_invites_updated_at
  before update on public.blackboxquiz_setup_invites
  for each row execute function public.blackboxquiz_set_updated_at();

alter table public.blackboxquiz_setup_invites enable row level security;

-- Managers may list their invites (never the hash). Anon gets nothing.
drop policy if exists "blackboxquiz_setup_invites_manager_select" on public.blackboxquiz_setup_invites;
create policy "blackboxquiz_setup_invites_manager_select"
  on public.blackboxquiz_setup_invites for select
  to authenticated
  using (
    public.blackboxquiz_is_super_admin()
    or public.blackboxquiz_org_role(organization_id) = 'ORGANIZATION_ADMIN'
  );

-- ----------------------------------------------------------------------------
-- Internal: password-attempt bookkeeping (lockout after 8 failures / 15 min).
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_public_touch_invite(p_invite_id uuid, p_ok boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_ok then
    update public.blackboxquiz_setup_invites
       set attempt_count = 0, locked_until = null
     where id = p_invite_id;
  else
    update public.blackboxquiz_setup_invites
       set attempt_count = attempt_count + 1,
           locked_until = case
             when attempt_count + 1 >= 8 then now() + interval '15 minutes'
             else locked_until
           end
     where id = p_invite_id;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Internal choke point: verify token + password (row-locked for throttling).
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_verify_invite_credentials(p_token text, p_password text)
returns public.blackboxquiz_setup_invites
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_invite public.blackboxquiz_setup_invites;
begin
  select * into v_invite
  from public.blackboxquiz_setup_invites
  where token = trim(p_token)
  for update;

  if not found then
    raise exception 'Invalid link or password';
  end if;
  if v_invite.locked_until is not null and v_invite.locked_until > now() then
    raise exception 'Too many attempts — try again later';
  end if;
  if v_invite.status = 'REVOKED' then
    raise exception 'This setup link has been revoked';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'This setup link has expired';
  end if;
  if crypt(left(trim(coalesce(p_password, '')), 72), v_invite.password_hash) <> v_invite.password_hash then
    perform public.blackboxquiz_public_touch_invite(v_invite.id, false);
    raise exception 'Invalid link or password';
  end if;
  perform public.blackboxquiz_public_touch_invite(v_invite.id, true);
  return v_invite;
end;
$$;

-- ----------------------------------------------------------------------------
-- Internal choke point: verify the password for a competition's own invite.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_verify_invite_for_competition(p_competition_id uuid, p_password text)
returns public.blackboxquiz_setup_invites
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_invite public.blackboxquiz_setup_invites;
begin
  select * into v_invite
  from public.blackboxquiz_setup_invites
  where competition_id = p_competition_id
  for update;

  if not found then
    raise exception 'This competition was not created from a setup link';
  end if;
  if v_invite.locked_until is not null and v_invite.locked_until > now() then
    raise exception 'Too many attempts — try again later';
  end if;
  if v_invite.status = 'REVOKED' then
    raise exception 'This setup link has been revoked';
  end if;
  if v_invite.status <> 'USED' then
    raise exception 'This competition is not available yet';
  end if;
  if crypt(left(trim(coalesce(p_password, '')), 72), v_invite.password_hash) <> v_invite.password_hash then
    perform public.blackboxquiz_public_touch_invite(v_invite.id, false);
    raise exception 'Invalid password';
  end if;
  perform public.blackboxquiz_public_touch_invite(v_invite.id, true);
  return v_invite;
end;
$$;

-- ----------------------------------------------------------------------------
-- Admin: create an invite. Returns the token + plaintext password exactly once.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_create_setup_invite(
  p_organization_id uuid,
  p_password text,
  p_label text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_token text;
begin
  if not (
    public.blackboxquiz_is_super_admin()
    or public.blackboxquiz_org_role(p_organization_id) = 'ORGANIZATION_ADMIN'
  ) then
    raise exception 'Not permitted to create setup invites for this organization';
  end if;
  if not exists (select 1 from public.blackboxquiz_organizations where id = p_organization_id) then
    raise exception 'Organization not found';
  end if;
  if p_password is null or length(trim(p_password)) < 4 then
    raise exception 'Password must be at least 4 characters';
  end if;
  if length(trim(p_password)) > 72 then
    raise exception 'Password must be 72 characters or fewer';
  end if;

  v_token := encode(gen_random_bytes(16), 'hex');

  insert into public.blackboxquiz_setup_invites
    (organization_id, token, password_hash, label, expires_at, created_by)
  values
    (p_organization_id, v_token,
     crypt(left(trim(p_password), 72), gen_salt('bf')),
     nullif(trim(coalesce(p_label, '')), ''), p_expires_at, auth.uid())
  returning id into v_id;

  insert into public.blackboxquiz_audit_logs
    (organization_id, competition_id, user_id, action, entity_type, entity_id, new_value)
  values
    (p_organization_id, null, auth.uid(), 'SETUP_INVITE_CREATED',
     'setup_invite', v_id, jsonb_build_object('label', nullif(trim(coalesce(p_label, '')), '')));

  return jsonb_build_object('id', v_id, 'token', v_token,
                            'password', trim(p_password), 'path', '/setup/' || v_token);
end;
$$;

-- ----------------------------------------------------------------------------
-- Admin: revoke an invite.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_revoke_setup_invite(p_invite_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org
  from public.blackboxquiz_setup_invites where id = p_invite_id;
  if not found then
    raise exception 'Setup invite not found';
  end if;
  if not (
    public.blackboxquiz_is_super_admin()
    or public.blackboxquiz_org_role(v_org) = 'ORGANIZATION_ADMIN'
  ) then
    raise exception 'Not permitted to revoke this setup invite';
  end if;

  update public.blackboxquiz_setup_invites set status = 'REVOKED' where id = p_invite_id;

  insert into public.blackboxquiz_audit_logs
    (organization_id, competition_id, user_id, action, entity_type, entity_id)
  values
    (v_org, null, auth.uid(), 'SETUP_INVITE_REVOKED', 'setup_invite', p_invite_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- Public: first gate of the setup wizard. Raises with a clear message when the
-- credentials are wrong / revoked / expired / locked.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_public_check_setup(p_token text, p_password text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite public.blackboxquiz_setup_invites;
  v_org_name text;
begin
  v_invite := public.blackboxquiz_verify_invite_credentials(p_token, p_password);
  select name into v_org_name
  from public.blackboxquiz_organizations where id = v_invite.organization_id;
  return jsonb_build_object('ok', true, 'organization_name', v_org_name);
end;
$$;

-- ----------------------------------------------------------------------------
-- Public: submit the whole setup in ONE atomic call — competition + point
-- tiers + two teams + all questions/options (mirrors 0005/0006 insert shapes
-- so validate_competition_start and the live workspace stay truthful).
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
  v_slug text;
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

  if v_invite.status <> 'ACTIVE' or v_invite.competition_id is not null then
    raise exception 'This setup link has already been used';
  end if;

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

  -- Create the competition (same slug-collision loop as 0005).
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

  -- Seed the standard point tiers (same as blackboxquiz_create_competition).
  insert into public.blackboxquiz_point_values (competition_id, points, color, display_order) values
    (v_competition_id, 100,  '#16A34A', 1),
    (v_competition_id, 200,  '#2563EB', 2),
    (v_competition_id, 300,  '#EAB308', 3),
    (v_competition_id, 500,  '#F97316', 4),
    (v_competition_id, 1000, '#DC2626', 5);

  -- Exactly two teams (respects trg_blackboxquiz_team_limit).
  insert into public.blackboxquiz_teams
    (competition_id, name, color, display_order)
  values
    (v_competition_id, trim(p_team_one), '#2563EB', 1),
    (v_competition_id, trim(p_team_two), '#DC2626', 2);

  -- Questions, validated with the shared 0006 validator.
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

  return jsonb_build_object('competition_id', v_competition_id, 'question_count', v_number - 1);
end;
$$;

-- ----------------------------------------------------------------------------
-- Public: start (or resume) a competition from the home screen by title +
-- password. Returns a DownloadablePackage-shaped bundle so the client can run
-- the existing pure engine, plus the event log for deterministic replay and
-- the data needed for the rules screen.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_public_start(p_title text, p_password text)
returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_cand record;
  v_invite public.blackboxquiz_setup_invites;
  v_match_invite_id uuid;
  v_match_competition_id uuid;
  v_matches integer := 0;
  v_status text;
  v_org uuid;
  v_locked boolean;
  v_comp record;
  v_teams jsonb;
  v_questions jsonb;
  v_point_values jsonb;
  v_events jsonb;
  v_org_name text;
  v_org_logo text;
begin
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Competition title is required';
  end if;

  for v_cand in
    select i.id as invite_id, c.id as competition_id
    from public.blackboxquiz_setup_invites i
    join public.blackboxquiz_competitions c on c.id = i.competition_id
    where lower(trim(c.name)) = lower(trim(p_title))
      and i.status = 'USED'
  loop
    select * into v_invite
    from public.blackboxquiz_setup_invites
    where id = v_cand.invite_id
    for update;

    if v_invite.locked_until is not null and v_invite.locked_until > now() then
      raise exception 'Too many attempts — try again later';
    end if;

    if crypt(left(trim(coalesce(p_password, '')), 72), v_invite.password_hash) = v_invite.password_hash then
      perform public.blackboxquiz_public_touch_invite(v_invite.id, true);
      v_matches := v_matches + 1;
      v_match_invite_id := v_invite.id;
      v_match_competition_id := v_cand.competition_id;
    else
      perform public.blackboxquiz_public_touch_invite(v_invite.id, false);
    end if;
  end loop;

  if v_matches = 0 then
    raise exception 'Invalid title or password';
  end if;
  if v_matches > 1 then
    raise exception 'Multiple competitions share that title — ask your administrator';
  end if;

  select * into v_comp
  from public.blackboxquiz_competitions
  where id = v_match_competition_id
  for update;

  if v_comp.status not in ('READY', 'LIVE', 'PAUSED') then
    raise exception 'This competition cannot be started (status: %)', v_comp.status;
  end if;

  select exists (
    select 1 from public.blackboxquiz_competition_locks
    where competition_id = v_match_competition_id and locked = true
  ) into v_locked;
  if v_locked then
    raise exception 'This competition is locked by an administrator';
  end if;

  -- Fresh start only: zero scores back to the configured starting score.
  -- Resuming a LIVE/PAUSED run keeps the projected scores intact.
  if v_comp.status = 'READY' then
    update public.blackboxquiz_teams
       set current_score = starting_score
     where competition_id = v_match_competition_id;
    update public.blackboxquiz_competitions
       set status = 'LIVE', current_team_id = null, current_question_id = null
     where id = v_match_competition_id;
  end if;

  select organization_id into v_org from public.blackboxquiz_competitions where id = v_match_competition_id;
  select name, logo_url into v_org_name, v_org_logo
  from public.blackboxquiz_organizations where id = v_org;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'shortName', t.short_name, 'color', t.color,
    'startingScore', t.starting_score, 'displayOrder', t.display_order
  ) order by t.display_order), '[]'::jsonb) into v_teams
  from public.blackboxquiz_teams t where t.competition_id = v_match_competition_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'questionNumber', q.question_number, 'questionText', q.question_text,
    'category', q.category, 'difficulty', q.difficulty, 'points', q.points,
    'pointColor', q.point_color, 'timeLimit', q.time_limit,
    'correctOptionId', q.correct_option_id, 'explanation', q.explanation,
    'imageUrl', q.image_url, 'audioUrl', q.audio_url, 'videoUrl', q.video_url,
    'status', q.status, 'displayOrder', q.display_order,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'questionId', o.question_id, 'optionKey', o.option_key,
        'optionText', o.option_text, 'imageUrl', o.image_url,
        'displayOrder', o.display_order
      ) order by o.display_order)
      from public.blackboxquiz_question_options o where o.question_id = q.id
    ), '[]'::jsonb)
  ) order by q.question_number), '[]'::jsonb) into v_questions
  from public.blackboxquiz_questions q where q.competition_id = v_match_competition_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pv.id, 'points', pv.points, 'color', pv.color, 'displayOrder', pv.display_order
  ) order by pv.display_order), '[]'::jsonb) into v_point_values
  from public.blackboxquiz_point_values pv where pv.competition_id = v_match_competition_id;

  -- Public-origin events for deterministic replay/resume on the client.
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', e.id, 'competition_id', e.competition_id,
    'device_id', e.device_id, 'sequence_number', e.sequence_number,
    'event_type', e.event_type, 'payload', e.payload,
    'created_at', (extract(epoch from e.created_at) * 1000)::bigint
  ) order by e.sequence_number), '[]'::jsonb) into v_events
  from public.blackboxquiz_competition_events e
  where e.competition_id = v_match_competition_id and e.device_id = v_match_invite_id;

  return jsonb_build_object(
    'bundle', jsonb_build_object(
      'schemaVersion', 1,
      'generatedAt', (extract(epoch from now()) * 1000)::bigint,
      'competition', jsonb_build_object(
        'id', v_comp.id, 'organizationId', v_org, 'name', v_comp.name,
        'slug', v_comp.slug, 'description', v_comp.description,
        'timezone', v_comp.timezone, 'defaultTimeLimit', v_comp.default_time_limit,
        'settings', v_comp.settings
      ),
      'teams', v_teams,
      'questions', v_questions,
      'pointValues', v_point_values,
      'branding', jsonb_build_object(
        'appName', 'BLACKBOX QUIZ',
        'footer', 'Designed & Developed by BlackBox Tech',
        'organizationName', v_org_name,
        'organizationLogoUrl', v_org_logo
      ),
      'permissions', '[]'::jsonb,
      'counts', jsonb_build_object(
        'teams', jsonb_array_length(v_teams),
        'questions', jsonb_array_length(v_questions),
        'options', (select count(*) from public.blackboxquiz_question_options o
                    join public.blackboxquiz_questions q on q.id = o.question_id
                    where q.competition_id = v_match_competition_id)
      )
    ),
    'events', v_events,
    'rules', jsonb_build_object(
      'teamNames', jsonb_build_array(v_teams -> 0 ->> 'name', v_teams -> 1 ->> 'name'),
      'colors', jsonb_build_array(v_teams -> 0 ->> 'color', v_teams -> 1 ->> 'color'),
      'questionCount', jsonb_array_length(v_questions),
      'timePerQuestion', v_comp.default_time_limit,
      'pointTiers', coalesce((select jsonb_agg(pv.points order by pv.display_order)
                              from public.blackboxquiz_point_values pv
                              where pv.competition_id = v_match_competition_id), '[]'::jsonb),
      'bonusEnabled', false
    )
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Public: batched event flush from the run screen. Inserts standard engine
-- events; the 0007 projection trigger derives scores/question status for free,
-- so admin scoreboard/results/exports work unchanged. Client-generated event
-- ids make retries idempotent; points are always clamped to the DB value.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_public_record_events(
  p_competition_id uuid,
  p_password text,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite public.blackboxquiz_setup_invites;
  v_base bigint;
  v_ordinal integer := 0;
  v_e jsonb;
  v_type text;
  v_payload jsonb;
  v_event_id uuid;
  v_db_points integer;
  v_inserted integer := 0;
begin
  v_invite := public.blackboxquiz_verify_invite_for_competition(p_competition_id, p_password);

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be a jsonb array';
  end if;
  if jsonb_array_length(p_events) > 500 then
    raise exception 'Too many events in one batch (max 500)';
  end if;

  select coalesce(max(e.sequence_number), 0) into v_base
  from public.blackboxquiz_competition_events e
  where e.competition_id = p_competition_id;

  for v_e in select * from jsonb_array_elements(p_events) loop
    v_ordinal := v_ordinal + 1;
    v_type := v_e->>'event_type';

    if v_type not in ('COMPETITION_STARTED', 'COMPETITION_PAUSED', 'COMPETITION_RESUMED',
                      'QUESTION_SELECTED', 'QUESTION_STARTED', 'ANSWER_SUBMITTED',
                      'BONUS_STARTED', 'BONUS_ANSWER_SUBMITTED', 'QUESTION_COMPLETED',
                      'SCORE_ADJUSTED', 'COMPETITION_COMPLETED') then
      continue;
    end if;

    -- Only accept properly-formed client uuids (idempotency keys).
    begin
      v_event_id := (v_e->>'event_id')::uuid;
    exception when others then
      continue;
    end;

    v_payload := coalesce(v_e->'payload', '{}'::jsonb);

    -- Never trust client point values: clamp to the stored question points.
    if v_payload ? 'questionId' and v_payload ? 'points' then
      select q.points into v_db_points
      from public.blackboxquiz_questions q
      where q.id = nullif(v_payload->>'questionId', '')::uuid;
      if v_db_points is not null then
        v_payload := jsonb_set(v_payload, '{points}', to_jsonb(v_db_points));
      end if;
    end if;

    insert into public.blackboxquiz_competition_events
      (id, competition_id, device_id, sequence_number, event_type, payload)
    values
      (v_event_id, p_competition_id, v_invite.id, v_base + v_ordinal, v_type, v_payload)
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'last_sequence', v_base + v_ordinal);
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants: internal helpers callable only by other definer functions; admin
-- functions by authenticated users; public functions by anon + authenticated.
-- ----------------------------------------------------------------------------
revoke execute on function public.blackboxquiz_public_touch_invite(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.blackboxquiz_verify_invite_credentials(text, text) from public, anon, authenticated;
revoke execute on function public.blackboxquiz_verify_invite_for_competition(uuid, text) from public, anon, authenticated;

revoke execute on function public.blackboxquiz_create_setup_invite(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.blackboxquiz_create_setup_invite(uuid, text, text, timestamptz) to authenticated;
revoke execute on function public.blackboxquiz_revoke_setup_invite(uuid) from public, anon;
grant execute on function public.blackboxquiz_revoke_setup_invite(uuid) to authenticated;

revoke execute on function public.blackboxquiz_public_check_setup(text, text) from public;
grant execute on function public.blackboxquiz_public_check_setup(text, text) to anon, authenticated;
revoke execute on function public.blackboxquiz_public_complete_setup(text, text, text, text, text, integer, jsonb) from public;
grant execute on function public.blackboxquiz_public_complete_setup(text, text, text, text, text, integer, jsonb) to anon, authenticated;
revoke execute on function public.blackboxquiz_public_start(text, text) from public;
grant execute on function public.blackboxquiz_public_start(text, text) to anon, authenticated;
revoke execute on function public.blackboxquiz_public_record_events(uuid, text, jsonb) from public;
grant execute on function public.blackboxquiz_public_record_events(uuid, text, jsonb) to anon, authenticated;
