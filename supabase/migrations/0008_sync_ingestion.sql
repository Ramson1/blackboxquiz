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
