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
security definer set search_path = public
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
security definer set search_path = public
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
