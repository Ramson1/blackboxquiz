-- ============================================================================
-- BLACKBOX QUIZ — ONE-SHOT SETUP (migrations 0002–0011 consolidated)
-- Paste this ENTIRE file into the Supabase Dashboard SQL editor and Run.
-- 0001 (tables) is already applied. Every statement is idempotent.
-- ============================================================================


-- ============================================================================
-- >>> 0002_rls_policies.sql
-- ============================================================================
-- ============================================================================
-- BLACKBOX QUIZ — RLS helper functions + policies (spec §66)
-- Permissions are enforced server-side; the UI never gates access alone.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions (security definer to avoid policy recursion)
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_is_super_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.blackboxquiz_profiles p
    where p.id = auth.uid()
      and p.role = 'SUPER_ADMIN'
      and p.status = 'ACTIVE'
  );
$$;

create or replace function public.blackboxquiz_org_role(p_organization_id uuid)
returns text
language sql
security definer set search_path = public
stable
as $$
  select m.role
  from public.blackboxquiz_organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
    and m.status = 'ACTIVE'
  limit 1;
$$;

-- Membership in the organization that owns a competition.
create or replace function public.blackboxquiz_competition_org_role(p_competition_id uuid)
returns text
language sql
security definer set search_path = public
stable
as $$
  select public.blackboxquiz_org_role(c.organization_id)
  from public.blackboxquiz_competitions c
  where c.id = p_competition_id;
$$;

create or replace function public.blackboxquiz_is_competition_member(p_competition_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    public.blackboxquiz_is_super_admin()
    or public.blackboxquiz_competition_org_role(p_competition_id) is not null,
    false
  );
$$;

-- Organization membership by organization id.
create or replace function public.blackboxquiz_is_org_member(p_organization_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    public.blackboxquiz_is_super_admin()
    or public.blackboxquiz_org_role(p_organization_id) is not null,
    false
  );
$$;

-- Manage rights: super admin, or ORGANIZATION_ADMIN of the owning org.
create or replace function public.blackboxquiz_can_manage_competition(p_competition_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    public.blackboxquiz_is_super_admin()
    or public.blackboxquiz_competition_org_role(p_competition_id) = 'ORGANIZATION_ADMIN',
    false
  );
$$;

-- ----------------------------------------------------------------------------
-- Profile guard: users may edit their own profile but never escalate
-- their own role or lift their own disable status.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_protect_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() = new.id
     and not public.blackboxquiz_is_super_admin()
     and (new.role is distinct from old.role
          or new.status is distinct from old.status) then
    raise exception 'Only a Super Admin may change role or status';
  end if;
  return new;
end;
$$;

create or replace trigger trg_blackboxquiz_protect_profile
  before update on public.blackboxquiz_profiles
  for each row execute function public.blackboxquiz_protect_profile();

-- ----------------------------------------------------------------------------
-- organizations
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_org_select on public.blackboxquiz_organizations;
create policy blackboxquiz_org_select on public.blackboxquiz_organizations
  for select to authenticated
  using (public.blackboxquiz_is_super_admin() or status <> 'ARCHIVED');

drop policy if exists blackboxquiz_org_write on public.blackboxquiz_organizations;
create policy blackboxquiz_org_write on public.blackboxquiz_organizations
  for all to authenticated
  using (public.blackboxquiz_is_super_admin())
  with check (public.blackboxquiz_is_super_admin());

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_profiles_select on public.blackboxquiz_profiles;
create policy blackboxquiz_profiles_select on public.blackboxquiz_profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.blackboxquiz_is_super_admin()
    or exists (
      select 1 from public.blackboxquiz_organization_members mine
      join public.blackboxquiz_organization_members theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = auth.uid()
        and mine.status = 'ACTIVE'
        and theirs.user_id = blackboxquiz_profiles.id
    )
  );

drop policy if exists blackboxquiz_profiles_update_self on public.blackboxquiz_profiles;
create policy blackboxquiz_profiles_update_self on public.blackboxquiz_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists blackboxquiz_profiles_admin_write on public.blackboxquiz_profiles;
create policy blackboxquiz_profiles_admin_write on public.blackboxquiz_profiles
  for all to authenticated
  using (public.blackboxquiz_is_super_admin())
  with check (public.blackboxquiz_is_super_admin());

-- ----------------------------------------------------------------------------
-- organization_members
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_members_select on public.blackboxquiz_organization_members;
create policy blackboxquiz_members_select on public.blackboxquiz_organization_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.blackboxquiz_is_super_admin()
    or public.blackboxquiz_org_role(organization_id) = 'ORGANIZATION_ADMIN'
  );

drop policy if exists blackboxquiz_members_write on public.blackboxquiz_organization_members;
create policy blackboxquiz_members_write on public.blackboxquiz_organization_members
  for all to authenticated
  using (
    public.blackboxquiz_is_super_admin()
    or (
      public.blackboxquiz_org_role(organization_id) = 'ORGANIZATION_ADMIN'
      and role <> 'SUPER_ADMIN'
    )
  )
  with check (
    public.blackboxquiz_is_super_admin()
    or (
      public.blackboxquiz_org_role(organization_id) = 'ORGANIZATION_ADMIN'
      and role <> 'SUPER_ADMIN'
    )
  );

-- ----------------------------------------------------------------------------
-- competitions
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_competitions_select on public.blackboxquiz_competitions;
create policy blackboxquiz_competitions_select on public.blackboxquiz_competitions
  for select to authenticated
  using (public.blackboxquiz_is_org_member(organization_id));

drop policy if exists blackboxquiz_competitions_insert on public.blackboxquiz_competitions;
create policy blackboxquiz_competitions_insert on public.blackboxquiz_competitions
  for insert to authenticated
  with check (
    public.blackboxquiz_is_super_admin()
    or public.blackboxquiz_org_role(organization_id) = 'ORGANIZATION_ADMIN'
  );

drop policy if exists blackboxquiz_competitions_update on public.blackboxquiz_competitions;
create policy blackboxquiz_competitions_update on public.blackboxquiz_competitions
  for update to authenticated
  using (public.blackboxquiz_can_manage_competition(id))
  with check (public.blackboxquiz_can_manage_competition(id));

drop policy if exists blackboxquiz_competitions_delete on public.blackboxquiz_competitions;
create policy blackboxquiz_competitions_delete on public.blackboxquiz_competitions
  for delete to authenticated
  using (public.blackboxquiz_is_super_admin());

-- ----------------------------------------------------------------------------
-- teams / point_values / questions / question_options
-- Read: anyone linked to the competition.
-- Write: managers (super admin / org admin). Fine-grained access-code
-- uploads happen through service-role RPCs, not direct client writes.
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_teams_select on public.blackboxquiz_teams;
create policy blackboxquiz_teams_select on public.blackboxquiz_teams
  for select to authenticated
  using (public.blackboxquiz_is_competition_member(competition_id));

drop policy if exists blackboxquiz_teams_write on public.blackboxquiz_teams;
create policy blackboxquiz_teams_write on public.blackboxquiz_teams
  for all to authenticated
  using (public.blackboxquiz_can_manage_competition(competition_id))
  with check (public.blackboxquiz_can_manage_competition(competition_id));

drop policy if exists blackboxquiz_point_values_select on public.blackboxquiz_point_values;
create policy blackboxquiz_point_values_select on public.blackboxquiz_point_values
  for select to authenticated
  using (public.blackboxquiz_is_competition_member(competition_id));

drop policy if exists blackboxquiz_point_values_write on public.blackboxquiz_point_values;
create policy blackboxquiz_point_values_write on public.blackboxquiz_point_values
  for all to authenticated
  using (public.blackboxquiz_can_manage_competition(competition_id))
  with check (public.blackboxquiz_can_manage_competition(competition_id));

drop policy if exists blackboxquiz_questions_select on public.blackboxquiz_questions;
create policy blackboxquiz_questions_select on public.blackboxquiz_questions
  for select to authenticated
  using (public.blackboxquiz_is_competition_member(competition_id));

drop policy if exists blackboxquiz_questions_write on public.blackboxquiz_questions;
create policy blackboxquiz_questions_write on public.blackboxquiz_questions
  for all to authenticated
  using (public.blackboxquiz_can_manage_competition(competition_id))
  with check (public.blackboxquiz_can_manage_competition(competition_id));

drop policy if exists blackboxquiz_options_select on public.blackboxquiz_question_options;
create policy blackboxquiz_options_select on public.blackboxquiz_question_options
  for select to authenticated
  using (
    exists (
      select 1 from public.blackboxquiz_questions q
      where q.id = question_id
        and public.blackboxquiz_is_competition_member(q.competition_id)
    )
  );

drop policy if exists blackboxquiz_options_write on public.blackboxquiz_question_options;
create policy blackboxquiz_options_write on public.blackboxquiz_question_options
  for all to authenticated
  using (
    exists (
      select 1 from public.blackboxquiz_questions q
      where q.id = question_id
        and public.blackboxquiz_can_manage_competition(q.competition_id)
    )
  )
  with check (
    exists (
      select 1 from public.blackboxquiz_questions q
      where q.id = question_id
        and public.blackboxquiz_can_manage_competition(q.competition_id)
    )
  );

-- ----------------------------------------------------------------------------
-- question_attempts — written during live play (via sync RPCs with the
-- service role) or by competition members; never updated or deleted.
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_attempts_select on public.blackboxquiz_question_attempts;
create policy blackboxquiz_attempts_select on public.blackboxquiz_question_attempts
  for select to authenticated
  using (public.blackboxquiz_is_competition_member(competition_id));

drop policy if exists blackboxquiz_attempts_insert on public.blackboxquiz_question_attempts;
create policy blackboxquiz_attempts_insert on public.blackboxquiz_question_attempts
  for insert to authenticated
  with check (public.blackboxquiz_is_competition_member(competition_id));

-- ----------------------------------------------------------------------------
-- competition_events — append-only log (immutability enforced by trigger).
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_events_select on public.blackboxquiz_competition_events;
create policy blackboxquiz_events_select on public.blackboxquiz_competition_events
  for select to authenticated
  using (public.blackboxquiz_is_competition_member(competition_id));

drop policy if exists blackboxquiz_events_insert on public.blackboxquiz_competition_events;
create policy blackboxquiz_events_insert on public.blackboxquiz_competition_events
  for insert to authenticated
  with check (public.blackboxquiz_is_competition_member(competition_id));

-- ----------------------------------------------------------------------------
-- competition_devices
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_devices_select on public.blackboxquiz_competition_devices;
create policy blackboxquiz_devices_select on public.blackboxquiz_competition_devices
  for select to authenticated
  using (public.blackboxquiz_is_competition_member(competition_id));

drop policy if exists blackboxquiz_devices_write on public.blackboxquiz_competition_devices;
create policy blackboxquiz_devices_write on public.blackboxquiz_competition_devices
  for all to authenticated
  using (public.blackboxquiz_can_manage_competition(competition_id))
  with check (public.blackboxquiz_can_manage_competition(competition_id));

-- ----------------------------------------------------------------------------
-- access_codes — management restricted; hashes never visible to plain members.
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_access_codes_select on public.blackboxquiz_access_codes;
create policy blackboxquiz_access_codes_select on public.blackboxquiz_access_codes
  for select to authenticated
  using (public.blackboxquiz_can_manage_competition(competition_id));

drop policy if exists blackboxquiz_access_codes_write on public.blackboxquiz_access_codes;
create policy blackboxquiz_access_codes_write on public.blackboxquiz_access_codes
  for all to authenticated
  using (public.blackboxquiz_can_manage_competition(competition_id))
  with check (public.blackboxquiz_can_manage_competition(competition_id));

-- ----------------------------------------------------------------------------
-- sync_records
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_sync_select on public.blackboxquiz_sync_records;
create policy blackboxquiz_sync_select on public.blackboxquiz_sync_records
  for select to authenticated
  using (public.blackboxquiz_is_competition_member(competition_id));

drop policy if exists blackboxquiz_sync_insert on public.blackboxquiz_sync_records;
create policy blackboxquiz_sync_insert on public.blackboxquiz_sync_records
  for insert to authenticated
  with check (public.blackboxquiz_is_competition_member(competition_id));

drop policy if exists blackboxquiz_sync_update on public.blackboxquiz_sync_records;
create policy blackboxquiz_sync_update on public.blackboxquiz_sync_records
  for update to authenticated
  using (public.blackboxquiz_is_competition_member(competition_id))
  with check (public.blackboxquiz_is_competition_member(competition_id));

-- ----------------------------------------------------------------------------
-- score_adjustments — Super Admin always; managers may view and record.
-- Existing rows are correction-audited history: no update/delete policies.
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_score_adj_select on public.blackboxquiz_score_adjustments;
create policy blackboxquiz_score_adj_select on public.blackboxquiz_score_adjustments
  for select to authenticated
  using (public.blackboxquiz_is_competition_member(competition_id));

drop policy if exists blackboxquiz_score_adj_insert on public.blackboxquiz_score_adjustments;
create policy blackboxquiz_score_adj_insert on public.blackboxquiz_score_adjustments
  for insert to authenticated
  with check (public.blackboxquiz_can_manage_competition(competition_id));

-- ----------------------------------------------------------------------------
-- audit_logs — immutable; append via service role / privileged actions.
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_audit_select on public.blackboxquiz_audit_logs;
create policy blackboxquiz_audit_select on public.blackboxquiz_audit_logs
  for select to authenticated
  using (
    public.blackboxquiz_is_super_admin()
    or user_id = auth.uid()
    or (organization_id is not null and public.blackboxquiz_is_org_member(organization_id))
    or (competition_id is not null and public.blackboxquiz_is_competition_member(competition_id))
  );

drop policy if exists blackboxquiz_audit_insert on public.blackboxquiz_audit_logs;
create policy blackboxquiz_audit_insert on public.blackboxquiz_audit_logs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.blackboxquiz_is_super_admin()
  );

-- ----------------------------------------------------------------------------
-- competition_locks
-- ----------------------------------------------------------------------------
drop policy if exists blackboxquiz_locks_select on public.blackboxquiz_competition_locks;
create policy blackboxquiz_locks_select on public.blackboxquiz_competition_locks
  for select to authenticated
  using (public.blackboxquiz_is_competition_member(competition_id));

drop policy if exists blackboxquiz_locks_write on public.blackboxquiz_competition_locks;
create policy blackboxquiz_locks_write on public.blackboxquiz_competition_locks
  for all to authenticated
  using (public.blackboxquiz_can_manage_competition(competition_id))
  with check (public.blackboxquiz_can_manage_competition(competition_id));

-- ============================================================================
-- >>> 0003_storage.sql
-- ============================================================================
-- ============================================================================
-- BLACKBOX QUIZ — Storage buckets + policies (spec §68)
-- Path convention: {organization_id}/{competition_id}/{filename}
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('branding',          'branding',          true),
  ('competition-assets','competition-assets', true),
  ('question-media',    'question-media',    true),
  ('team-logos',        'team-logos',        true),
  ('reports',           'reports',           false)
on conflict (id) do nothing;

-- Helper: is the caller a manager of the competition embedded in the path?
create or replace function public.blackboxquiz_can_manage_storage_path(p_bucket text, p_path text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select case
    -- branding/{organization_id}/...
    when p_bucket = 'branding' then
      public.blackboxquiz_is_super_admin()
      or public.blackboxquiz_org_role(
           nullif(split_part(p_path, '/', 1), '')::uuid) = 'ORGANIZATION_ADMIN'
    -- reports/{organization_id}/... are org-admin managed as well
    when p_bucket = 'reports' then
      public.blackboxquiz_is_super_admin()
      or public.blackboxquiz_org_role(
           nullif(split_part(p_path, '/', 1), '')::uuid) = 'ORGANIZATION_ADMIN'
    -- {competition_id}/... in competition-scoped buckets
    else
      public.blackboxquiz_can_manage_competition(
        nullif(split_part(p_path, '/', 1), '')::uuid)
  end;
$$;

-- Public read for asset buckets; reports require management rights.
drop policy if exists blackboxquiz_storage_public_read on storage.objects;
create policy blackboxquiz_storage_public_read on storage.objects
  for select
  using (bucket_id in ('branding', 'competition-assets', 'question-media', 'team-logos'));

drop policy if exists blackboxquiz_storage_reports_read on storage.objects;
create policy blackboxquiz_storage_reports_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports'
    and public.blackboxquiz_is_org_member(
      nullif(split_part(name, '/', 1), '')::uuid)
  );

drop policy if exists blackboxquiz_storage_write on storage.objects;
create policy blackboxquiz_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('branding', 'competition-assets', 'question-media', 'team-logos', 'reports')
    and public.blackboxquiz_can_manage_storage_path(bucket_id, name)
  );

drop policy if exists blackboxquiz_storage_update on storage.objects;
create policy blackboxquiz_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('branding', 'competition-assets', 'question-media', 'team-logos', 'reports')
    and public.blackboxquiz_can_manage_storage_path(bucket_id, name)
  )
  with check (
    public.blackboxquiz_can_manage_storage_path(bucket_id, name)
  );

drop policy if exists blackboxquiz_storage_delete on storage.objects;
create policy blackboxquiz_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('branding', 'competition-assets', 'question-media', 'team-logos', 'reports')
    and (
      public.blackboxquiz_is_super_admin()
      or public.blackboxquiz_can_manage_storage_path(bucket_id, name)
    )
  );

-- ============================================================================
-- >>> 0004_access_codes.sql
-- ============================================================================
-- ============================================================================
-- BLACKBOX QUIZ — Access code RPC (spec §9, §99, §100)
-- Codes look like BX-7K29-PQ81, are cryptographically random,
-- stored only as SHA-256 hashes, and are expirable / revocable / scoped.
-- ============================================================================

-- Create a code. Returns the plaintext exactly once (never stored).
create or replace function public.blackboxquiz_create_access_code(
  p_competition_id uuid,
  p_permissions jsonb default '[]'::jsonb,
  p_expires_at timestamptz default null,
  p_max_uses integer default null
)
returns text
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I/O/0/1
  v_code text := 'BX-';
  v_random bytea;
  v_char_pos int;
  i int;
  v_hash text;
begin
  if not public.blackboxquiz_can_manage_competition(p_competition_id) then
    raise exception 'Not permitted to create access codes for this competition';
  end if;

  if p_permissions is not null
     and exists (
       select 1 from jsonb_array_elements_text(p_permissions) perm
       where perm not in ('UPLOAD_QUESTIONS', 'EDIT_QUESTIONS', 'VIEW_RESULTS',
                          'EXPORT_RESULTS', 'MANAGE_TEAMS', 'MANAGE_SETTINGS')) then
    raise exception 'Unknown permission in access code';
  end if;

  -- 8 unambiguous characters: BX-XXXX-XXXX (two independent random blocks).
  for v_block in 1..2 loop
    v_random := gen_random_bytes(8);
    for i in 0..3 loop
      v_char_pos := 1 + (get_byte(v_random, i) % length(alphabet));
      v_code := v_code || substr(alphabet, v_char_pos, 1);
    end loop;
    v_code := v_code || '-';
  end loop;
  v_code := rtrim(v_code, '-');

  v_hash := encode(digest(v_code, 'sha256'), 'hex');

  insert into public.blackboxquiz_access_codes
    (competition_id, code_hash, code_prefix, permissions, expires_at, max_uses, created_by)
  values
    (p_competition_id, v_hash, left(v_code, 8), coalesce(p_permissions, '[]'::jsonb),
     p_expires_at, p_max_uses, auth.uid());

  return v_code;
end;
$$;

-- Validate a code for a competition. Returns permissions when valid.
create or replace function public.blackboxquiz_validate_access_code(
  p_competition_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_hash text;
  rec record;
begin
  v_hash := encode(digest(trim(p_code), 'sha256'), 'hex');

  select * into rec
  from public.blackboxquiz_access_codes
  where competition_id = p_competition_id
    and code_hash = v_hash
  for update;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'INVALID_CODE');
  end if;

  if rec.status = 'REVOKED' then
    return jsonb_build_object('valid', false, 'reason', 'REVOKED');
  end if;

  if rec.expires_at is not null and rec.expires_at < now() then
    update public.blackboxquiz_access_codes
       set status = 'EXPIRED' where id = rec.id;
    return jsonb_build_object('valid', false, 'reason', 'EXPIRED');
  end if;

  if rec.status <> 'ACTIVE' then
    return jsonb_build_object('valid', false, 'reason', lower(rec.status));
  end if;

  update public.blackboxquiz_access_codes
     set usage_count = usage_count + 1,
         status = case
                   when rec.max_uses is not null and usage_count + 1 >= rec.max_uses
                   then 'EXHAUSTED' else status
                 end
   where id = rec.id;

  return jsonb_build_object(
    'valid', true,
    'code_id', rec.id,
    'permissions', rec.permissions
  );
end;
$$;

-- Revoke an existing code (management rights required).
create or replace function public.blackboxquiz_revoke_access_code(p_code_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_competition uuid;
begin
  select competition_id into v_competition
  from public.blackboxquiz_access_codes where id = p_code_id;

  if not found then
    raise exception 'Access code not found';
  end if;
  if not public.blackboxquiz_can_manage_competition(v_competition) then
    raise exception 'Not permitted to revoke this access code';
  end if;

  update public.blackboxquiz_access_codes
     set status = 'REVOKED', revoked_at = now()
   where id = p_code_id;
end;
$$;

-- Keep the DB-clock expiry honest in the background.
create or replace function public.blackboxquiz_expire_access_codes()
returns void
language sql
security definer set search_path = public
as $$
  update public.blackboxquiz_access_codes
     set status = 'EXPIRED'
   where status = 'ACTIVE' and expires_at is not null and expires_at < now();
$$;

-- ============================================================================
-- >>> 0005_competition_lifecycle.sql
-- ============================================================================
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
grant execute on function public.blackboxquiz_lock_competition(uuid, text) to authenticated;
grant execute on function public.blackboxquiz_unlock_competition(uuid) to authenticated;
grant execute on function public.blackboxquiz_set_competition_status(uuid, text) to authenticated;
grant execute on function public.blackboxquiz_create_competition(uuid, text, text, timestamptz, text, integer) to authenticated;

-- ============================================================================
-- >>> 0006_question_management.sql
-- ============================================================================
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

-- ============================================================================
-- >>> 0007_live_scoring.sql
-- ============================================================================
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

-- ============================================================================
-- >>> 0008_sync_ingestion.sql
-- ============================================================================
-- ============================================================================
-- BLACKBOX QUIZ — Synchronization / idempotent event ingestion (spec §34–§39)
-- A single SECURITY DEFINER RPC that the offline client calls once per queued
-- event. It is idempotent (unique event_id), detects sequence conflicts, drives
-- the scoring projection (via the 0007 after-insert trigger) exactly once, and
-- records admin-visible sync state. Never overwrites competition history.
-- ============================================================================

create or replace function public.blackboxquiz_ingest_event(
  p_event_id       uuid,
  p_competition_id uuid,
  p_device_id      uuid,
  p_sequence_number bigint,
  p_event_type     text,
  p_payload        jsonb,
  p_created_at     timestamptz default now()
) returns table (status text, reason text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only competition members may sync events into a competition.
  if not public.blackboxquiz_is_competition_member(p_competition_id) then
    raise exception 'not permitted to sync this competition';
  end if;

  -- §44: a revoked device must not start or advance a competition.
  if exists (
    select 1 from public.blackboxquiz_competition_devices
    where competition_id = p_competition_id
      and device_identifier = p_device_id::text
      and status = 'REVOKED'
  ) then
    raise exception 'this device has been revoked for the competition';
  end if;

  -- Idempotency (§38): if this exact event was already stored, it is already
  -- processed. Do NOT re-insert (which would re-fire the scoring trigger and
  -- award points twice) — just make sure a SYNCED record exists and return.
  if exists (
    select 1 from public.blackboxquiz_competition_events
    where id = p_event_id
  ) then
    insert into public.blackboxquiz_sync_records
      (competition_id, device_id, event_id, sequence_number, status, synced_at)
    values
      (p_competition_id, p_device_id, p_event_id, p_sequence_number, 'SYNCED', now())
    on conflict (event_id) do update
      set status = 'SYNCED',
          synced_at = coalesce(public.blackboxquiz_sync_records.synced_at, now());
    return query select 'SYNCED'::text, 'already synchronized'::text;
    return;
  end if;

  -- Conflict (§39): another event already occupies (competition, device, seq)
  -- but with a different id. Do not blindly overwrite — record an admin-visible
  -- audit entry and surface a conflict to the client. Never discard silently.
  if exists (
    select 1 from public.blackboxquiz_competition_events
    where competition_id = p_competition_id
      and device_id is not distinct from p_device_id
      and sequence_number = p_sequence_number
  ) then
    insert into public.blackboxquiz_audit_logs
      (competition_id, user_id, device_id, action, entity_type, entity_id, new_value, reason)
    values
      (p_competition_id, auth.uid(), p_device_id, 'SYNC_CONFLICT',
       'competition_event', p_event_id,
       jsonb_build_object('sequence_number', p_sequence_number, 'event_type', p_event_type),
       'Conflicting sequence number already exists for this device');
    return query select 'CONFLICT'::text,
      'sequence number already used by another event'::text;
    return;
  end if;

  -- Fresh event: append to the immutable log. The after-insert projection
  -- trigger (0007_live_scoring) applies scoring/state exactly once here.
  insert into public.blackboxquiz_competition_events
    (id, competition_id, device_id, sequence_number, event_type, payload, created_at)
  values
    (p_event_id, p_competition_id, p_device_id, p_sequence_number,
     p_event_type, p_payload, p_created_at);

  insert into public.blackboxquiz_sync_records
    (competition_id, device_id, event_id, sequence_number, status, synced_at)
  values
    (p_competition_id, p_device_id, p_event_id, p_sequence_number, 'SYNCED', now())
  on conflict (event_id) do nothing;

  return query select 'SYNCED'::text, null::text;
end;
$$;

revoke execute on function public.blackboxquiz_ingest_event(
  uuid, uuid, uuid, bigint, text, jsonb, timestamptz
) from public, anon;
grant execute on function public.blackboxquiz_ingest_event(
  uuid, uuid, uuid, bigint, text, jsonb, timestamptz
) to authenticated;

-- ============================================================================
-- >>> 0009_device_authorization.sql
-- ============================================================================
-- ============================================================================
-- BLACKBOX QUIZ — Device authorization (spec §44)
-- A competition can optionally be paired to an authorized device. Devices are
-- registered (or "touched") by the operator console and authorized/revoked by a
-- manager. A REVOKED device is blocked server-side from syncing events, so a
-- revoked device cannot start or advance a competition.
-- ============================================================================

-- Register (or refresh) the current device for a competition. Returns the row id.
-- Re-registering a revoked device keeps it REVOKED (only admins can change status).
create or replace function public.blackboxquiz_register_device(
  p_competition_id    uuid,
  p_device_identifier text,
  p_device_name       text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.blackboxquiz_is_competition_member(p_competition_id) then
    raise exception 'not permitted to register a device for this competition';
  end if;

  insert into public.blackboxquiz_competition_devices
    (competition_id, device_identifier, device_name, last_seen_at)
  values
    (p_competition_id, p_device_identifier, p_device_name, now())
  on conflict (competition_id, device_identifier) do update
    set last_seen_at = now(),
        device_name = coalesce(excluded.device_name,
                               public.blackboxquiz_competition_devices.device_name)
  returning id into v_id;

  return v_id;
end;
$$;

-- Authorize or revoke a device (manager only).
create or replace function public.blackboxquiz_set_device_status(
  p_device_id uuid,
  p_status    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition uuid;
begin
  if p_status not in ('PENDING', 'AUTHORIZED', 'REVOKED') then
    raise exception 'invalid device status';
  end if;

  select competition_id into v_competition
  from public.blackboxquiz_competition_devices where id = p_device_id;

  if not found then
    raise exception 'device not found';
  end if;
  if not public.blackboxquiz_can_manage_competition(v_competition) then
    raise exception 'not permitted to manage this device';
  end if;

  update public.blackboxquiz_competition_devices
     set status = p_status,
         authorized_by = case when p_status = 'AUTHORIZED' then auth.uid() else authorized_by end,
         authorized_at = case when p_status = 'AUTHORIZED' then now() else authorized_at end,
         revoked_at    = case when p_status = 'REVOKED' then now() else revoked_at end
   where id = p_device_id;
end;
$$;

revoke execute on function public.blackboxquiz_register_device(uuid, text, text)
  from public, anon;
grant execute on function public.blackboxquiz_register_device(uuid, text, text)
  to authenticated;

revoke execute on function public.blackboxquiz_set_device_status(uuid, text)
  from public, anon;
grant execute on function public.blackboxquiz_set_device_status(uuid, text)
  to authenticated;

-- ============================================================================
-- >>> 0010_score_adjustment.sql
-- ============================================================================
-- ============================================================================
-- BLACKBOX QUIZ — Score adjustment + emergency lock (spec §56, §57, §101, §102)
--
-- Manual score adjustments are administrative, audited, and event-sourced:
-- they append a SCORE_ADJUSTED event so the score stays fully reconstructable
-- from history (§108). The 0007 projection trigger applies the delta to
-- teams.current_score, so this function records the adjustment row + audit but
-- never mutates the score directly.
-- ============================================================================

-- Adjust a team's score by a signed amount with a mandatory reason.
create or replace function public.blackboxquiz_adjust_score(
  p_team_id    uuid,
  p_adjustment integer,
  p_reason     text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_team        public.blackboxquiz_teams%rowtype;
  v_comp        uuid;
  v_org         uuid;
  v_prev        integer;
  v_new         integer;
  v_seq         bigint;
  v_adjust_id   uuid;
  v_reason      text;
begin
  if p_adjustment is null or p_adjustment = 0 then
    raise exception 'Adjustment must be a non-zero amount';
  end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A reason is required';
  end if;

  select * into v_team from public.blackboxquiz_teams where id = p_team_id;
  if not found then
    raise exception 'Team not found';
  end if;
  v_comp := v_team.competition_id;

  if not public.blackboxquiz_can_manage_competition(v_comp) then
    raise exception 'Not permitted to adjust scores for this competition';
  end if;

  select organization_id into v_org
  from public.blackboxquiz_competitions where id = v_comp;

  v_prev := v_team.current_score;
  v_new  := v_prev + p_adjustment;
  if v_new < 0 then
    raise exception 'Adjustment would make the score negative';
  end if;

  insert into public.blackboxquiz_score_adjustments
    (competition_id, team_id, previous_score, adjustment, new_score, reason, created_by)
  values
    (v_comp, p_team_id, v_prev, p_adjustment, v_new, v_reason, auth.uid())
  returning id into v_adjust_id;

  -- Append the reconstructable event (the 0007 trigger applies the delta).
  v_seq := coalesce((
    select max(sequence_number) from public.blackboxquiz_competition_events
    where competition_id = v_comp
  ), 0) + 1;

  insert into public.blackboxquiz_competition_events
    (competition_id, device_id, sequence_number, event_type, payload)
  values
    (v_comp, null, v_seq, 'SCORE_ADJUSTED', jsonb_build_object(
      'teamId', p_team_id,
      'adjustment', p_adjustment,
      'previousScore', v_prev,
      'newScore', v_new,
      'reason', v_reason,
      'adjustmentId', v_adjust_id
    ));

  insert into public.blackboxquiz_audit_logs
    (organization_id, competition_id, user_id, action, entity_type, entity_id,
     old_value, new_value, reason)
  values
    (v_org, v_comp, auth.uid(), 'SCORE_ADJUSTMENT', 'team', p_team_id,
     jsonb_build_object('score', v_prev),
     jsonb_build_object('score', v_new, 'adjustment', p_adjustment),
     v_reason);

  return jsonb_build_object(
    'adjustmentId', v_adjust_id,
    'previousScore', v_prev,
    'adjustment', p_adjustment,
    'newScore', v_new
  );
end;
$$;

-- Emergency lock (spec §102): Super Admin only; blocks a device from continuing.
create or replace function public.blackboxquiz_emergency_lock(
  p_competition_id uuid,
  p_reason         text default 'Emergency lock by Super Admin'
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
begin
  if not public.blackboxquiz_is_super_admin() then
    raise exception 'Only a Super Admin may trigger an emergency lock';
  end if;

  select organization_id into v_org
  from public.blackboxquiz_competitions where id = p_competition_id;
  if not found then
    raise exception 'Competition not found';
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
    (v_org, p_competition_id, auth.uid(), 'EMERGENCY_LOCK', 'competition',
     p_competition_id, jsonb_build_object('reason', p_reason));
end;
$$;

revoke execute on function public.blackboxquiz_adjust_score(uuid, integer, text)
  from public, anon;
grant execute on function public.blackboxquiz_adjust_score(uuid, integer, text)
  to authenticated;

revoke execute on function public.blackboxquiz_emergency_lock(uuid, text)
  from public, anon;
grant execute on function public.blackboxquiz_emergency_lock(uuid, text)
  to authenticated;

-- ============================================================================
-- >>> 0011_realtime_publication.sql
-- ============================================================================
-- 0011: Enable Supabase Realtime for the admin live monitor (spec §28, §797).
-- The append-only event log is the source of truth; publishing INSERTs lets
-- managers observe a competition in real time. This is observation only — the
-- scoreboard itself is driven by local engine state and never depends on it.

-- Add the events table to the realtime publication (idempotent).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'blackboxquiz_competition_events'
  ) then
    alter publication supabase_realtime
      add table public.blackboxquiz_competition_events;
  end if;
end
$$;

-- ============================================================================
-- >>> 0012_public_setup_invites.sql
-- ============================================================================
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
