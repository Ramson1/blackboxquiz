-- ============================================================================
-- 0014 — Manage setup invites from the admin dashboard
--
-- Adds the three operations an admin needs on the Setup Invites screen that
-- 0012 did not cover: edit (label / expiry / password reset), undo a revoke
-- (reactivate) and delete. Same security model as create/revoke: SECURITY
-- DEFINER functions granted to authenticated, each gated internally to a
-- super admin or the invite's own organization admin, each audit-logged.
-- Anon still has zero table access.
--
-- Password handling is unchanged from 0012: only a bcrypt hash is ever
-- stored, so an existing password can never be read back. When an admin sets
-- a new password through the edit RPC the plaintext is returned exactly once
-- for a copy-on-reveal card.
--
-- Idempotent: safe to paste into the Supabase SQL editor repeatedly.
-- Prereq: 0001-0013 (pgcrypto is used, so these functions pin
-- search_path = public, extensions).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Internal: resolve an invite + assert the caller may manage it. Returns the
-- invite row; raises for not-found / not-permitted.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_assert_invite_manager(p_invite_id uuid)
returns public.blackboxquiz_setup_invites
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite public.blackboxquiz_setup_invites;
begin
  select * into v_invite
  from public.blackboxquiz_setup_invites
  where id = p_invite_id;

  if not found then
    raise exception 'Setup invite not found';
  end if;
  if not (
    public.blackboxquiz_is_super_admin()
    or public.blackboxquiz_org_role(v_invite.organization_id) = 'ORGANIZATION_ADMIN'
  ) then
    raise exception 'Not permitted to manage this setup invite';
  end if;
  return v_invite;
end;
$$;

-- ----------------------------------------------------------------------------
-- Admin: edit an invite. Updates label + expiry and, when a new password is
-- supplied, re-hashes it and returns the plaintext once (reveal-only). Passing
-- a null/blank password leaves the current hash untouched.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_update_setup_invite(
  p_invite_id uuid,
  p_label text default null,
  p_expires_at timestamptz default null,
  p_password text default null
)
returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_invite public.blackboxquiz_setup_invites;
  v_new_password text;
  v_rotated boolean := false;
begin
  v_invite := public.blackboxquiz_assert_invite_manager(p_invite_id);

  if p_password is not null and length(trim(p_password)) > 0 then
    if length(trim(p_password)) < 4 then
      raise exception 'Password must be at least 4 characters';
    end if;
    if length(trim(p_password)) > 72 then
      raise exception 'Password must be 72 characters or fewer';
    end if;
    v_new_password := left(trim(p_password), 72);
    v_rotated := true;
  end if;

  update public.blackboxquiz_setup_invites
     set label = nullif(trim(coalesce(p_label, '')), ''),
         expires_at = p_expires_at,
         password_hash = case
           when v_rotated then crypt(v_new_password, gen_salt('bf'))
           else password_hash
         end
   where id = p_invite_id;

  insert into public.blackboxquiz_audit_logs
    (organization_id, competition_id, user_id, action, entity_type, entity_id, new_value)
  values
    (v_invite.organization_id, v_invite.competition_id, auth.uid(), 'SETUP_INVITE_UPDATED',
     'setup_invite', p_invite_id,
     jsonb_build_object('rotated_password', v_rotated,
                        'label', nullif(trim(coalesce(p_label, '')), '')));

  return jsonb_build_object(
    'rotated', v_rotated,
    'password', case when v_rotated then v_new_password else null end
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Admin: undo a revoke. Restores a REVOKED invite to ACTIVE and clears any
-- brute-force lockout. Used invites (a competition already exists) stay USED.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_reactivate_setup_invite(p_invite_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite public.blackboxquiz_setup_invites;
begin
  v_invite := public.blackboxquiz_assert_invite_manager(p_invite_id);

  if v_invite.status <> 'REVOKED' then
    raise exception 'Only a revoked invite can be reactivated';
  end if;

  update public.blackboxquiz_setup_invites
     set status = 'ACTIVE', attempt_count = 0, locked_until = null
   where id = p_invite_id;

  insert into public.blackboxquiz_audit_logs
    (organization_id, competition_id, user_id, action, entity_type, entity_id)
  values
    (v_invite.organization_id, v_invite.competition_id, auth.uid(),
     'SETUP_INVITE_REACTIVATED', 'setup_invite', p_invite_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- Admin: delete an invite. Removes the setup link only — a competition already
-- created from it is left untouched (its invite_id FK on the invite side goes
-- with the row). Blocked for USED invites so a live setup link is never
-- deleted by accident; revoke instead to cut access while keeping history.
-- ----------------------------------------------------------------------------
create or replace function public.blackboxquiz_delete_setup_invite(p_invite_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite public.blackboxquiz_setup_invites;
begin
  v_invite := public.blackboxquiz_assert_invite_manager(p_invite_id);

  if v_invite.status = 'USED' then
    raise exception 'This invite already produced a competition — revoke it instead of deleting';
  end if;

  insert into public.blackboxquiz_audit_logs
    (organization_id, competition_id, user_id, action, entity_type, entity_id, old_value)
  values
    (v_invite.organization_id, v_invite.competition_id, auth.uid(), 'SETUP_INVITE_DELETED',
     'setup_invite', p_invite_id,
     jsonb_build_object('label', v_invite.label, 'status', v_invite.status));

  delete from public.blackboxquiz_setup_invites where id = p_invite_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants: helpers callable only by other definer functions; management
-- functions by authenticated users only.
-- ----------------------------------------------------------------------------
revoke execute on function public.blackboxquiz_assert_invite_manager(uuid) from public, anon, authenticated;

revoke execute on function public.blackboxquiz_update_setup_invite(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.blackboxquiz_update_setup_invite(uuid, text, timestamptz, text) to authenticated;
revoke execute on function public.blackboxquiz_reactivate_setup_invite(uuid) from public, anon;
grant execute on function public.blackboxquiz_reactivate_setup_invite(uuid) to authenticated;
revoke execute on function public.blackboxquiz_delete_setup_invite(uuid) from public, anon;
grant execute on function public.blackboxquiz_delete_setup_invite(uuid) to authenticated;
