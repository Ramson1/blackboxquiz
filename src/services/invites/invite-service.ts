import { createClient } from "@/lib/supabase/server";
import type { SetupInvite } from "@/types/database";

/**
 * Setup-invite data access (migration 0012). Admin-created links that let a
 * non-authenticated user configure a competition at /setup/<token>. Passwords
 * are stored only as bcrypt hashes; the plaintext is returned exactly once at
 * creation. Listing relies on the manager-select RLS policy and never reads
 * the password_hash column.
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
      "id, organization_id, token, label, competition_id, status, expires_at, created_by, used_at, created_at, updated_at"
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
