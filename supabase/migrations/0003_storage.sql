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
