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
