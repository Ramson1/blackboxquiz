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
