import { createClient } from "@/lib/supabase/server";
import type { AccessCode } from "@/types/database";
import { ACCESS_PERMISSIONS } from "@/lib/permissions/roles";

/**
 * Access-code data access (spec §9, §99, §100). Codes are stored only as
 * SHA-256 hashes; the plaintext is returned exactly once at creation. All
 * operations are authorized server-side (manager scope) by the RPCs themselves.
 */

export { ACCESS_PERMISSIONS } from "@/lib/permissions/roles";
export type { AccessPermission } from "@/lib/permissions/roles";

export async function listAccessCodes(competitionId: string): Promise<AccessCode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_access_codes")
    .select("*")
    .eq("competition_id", competitionId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as AccessCode[];
}

/** Creates a code and returns its plaintext (shown once, never stored). */
export async function createAccessCode(input: {
  competitionId: string;
  permissions: string[];
  expiresAt?: string | null;
  maxUses?: number | null;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_create_access_code", {
    p_competition_id: input.competitionId,
    p_permissions: input.permissions.filter((p) =>
      (ACCESS_PERMISSIONS as readonly string[]).includes(p)
    ),
    p_expires_at: input.expiresAt ?? null,
    p_max_uses: input.maxUses ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function revokeAccessCode(codeId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("blackboxquiz_revoke_access_code", {
    p_code_id: codeId,
  });
  if (error) throw new Error(error.message);
}

export interface CodeValidation {
  valid: boolean;
  reason?: string;
  code_id?: string;
  permissions?: string[];
}

/** Validates a code for a competition (§100 — the backend does all checks). */
export async function validateAccessCode(
  competitionId: string,
  code: string
): Promise<CodeValidation> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_validate_access_code", {
    p_competition_id: competitionId,
    p_code: code,
  });
  if (error) throw new Error(error.message);
  return (data ?? { valid: false, reason: "INVALID_CODE" }) as CodeValidation;
}
