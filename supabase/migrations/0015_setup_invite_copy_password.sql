-- ============================================================================
-- 0015 — Store a retrievable plaintext for setup-invite passwords
--
-- Requested behaviour: admins want to COPY an invite's password from the
-- Setup Invites screen at any time, not only at creation. Verification still
-- runs against the bcrypt hash (unchanged); we simply ALSO persist the
-- plaintext so the manager-only UI can hand it back. Exposure stays bounded by
-- the existing manager_select RLS policy (super admin / org admin only).
--
-- - Adds blackboxquiz_setup_invites.password_plain.
-- - create_setup_invite now persists the plaintext as well as the hash.
-- - update_setup_invite persists the new plaintext whenever it rotates the
--   password (so "Copy password" keeps working after a reset).
--
-- Idempotent: safe to re-run. pgcrypto used -> search_path public, extensions.
-- ============================================================================

alter table public.blackboxquiz_setup_invites
  add column if not exists password_plain text;

-- ----------------------------------------------------------------------------
-- Admin: create an invite. Persists hash + plaintext; returns the token +
-- plaintext password (shown once) exactly as before.
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
    (organization_id, token, password_hash, password_plain, label, expires_at, created_by)
  values
    (p_organization_id, v_token,
     crypt(left(trim(p_password), 72), gen_salt('bf')),
     left(trim(p_password), 72),
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
-- Admin: edit an invite. When a new password is supplied, persist BOTH the
-- bcrypt hash (verification) and the plaintext (copyable), and return the
-- plaintext once for the reveal card. Blank password leaves both untouched.
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
         end,
         password_plain = case
           when v_rotated then v_new_password
           else password_plain
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
