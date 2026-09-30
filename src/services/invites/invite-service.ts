import { createClient } from "@/lib/supabase/server";
import type { SetupInvite } from "@/types/database";

/**
 * Setup-invite data access (migration 0012). Admin-created links that let a
 * non-authenticated user configure a competition at /setup/<token>. Verification
 * uses the bcrypt password_hash; a plaintext copy is also persisted (0015) so
 * managers can retrieve/copy an invite's password later. Listing relies on the
 * manager-select RLS policy and never reads the password_hash column.
 */

export interface NewSetupInvite {
  id: string;
  token: string;
  password: string;
  path: string;
}

export async function listSetupInvites(): Promise<SetupInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_setup_invites")
    .select(
      "id, organization_id, token, label, competition_id, status, expires_at, password_plain, created_by, used_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as SetupInvite[];
}

/** Creates an invite and returns the token + plaintext password (shown once). */
export async function createSetupInvite(input: {
  organizationId: string;
  password: string;
  label?: string | null;
  expiresAt?: string | null;
}): Promise<NewSetupInvite> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_create_setup_invite", {
    p_organization_id: input.organizationId,
    p_password: input.password,
    p_label: input.label ?? null,
    p_expires_at: input.expiresAt ?? null,
  });
  if (error) throw new Error(error.message);
  return data as unknown as NewSetupInvite;
}

export async function revokeSetupInvite(inviteId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("blackboxquiz_revoke_setup_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Edit an invite: label + expiry always apply; a non-empty password rotates
 * the credential. Because only a bcrypt hash is stored, the new plaintext is
 * returned once (null when the password was not changed) for a reveal-once card.
 */
export async function updateSetupInvite(input: {
  inviteId: string;
  label?: string | null;
  expiresAt?: string | null;
  password?: string | null;
}): Promise<{ rotated: boolean; password: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_update_setup_invite", {
    p_invite_id: input.inviteId,
    p_label: input.label ?? null,
    p_expires_at: input.expiresAt ?? null,
    p_password: input.password ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? { rotated: false, password: null }) as unknown as {
    rotated: boolean;
    password: string | null;
  };
}

/** Undo a revoke — restore a REVOKED invite to ACTIVE. */
export async function reactivateSetupInvite(inviteId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("blackboxquiz_reactivate_setup_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw new Error(error.message);
}

/** Delete an unused/revoked invite. The RPC rejects USED invites. */
export async function deleteSetupInvite(inviteId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("blackboxquiz_delete_setup_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw new Error(error.message);
}
