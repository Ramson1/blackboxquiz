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
