"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { clientRateKey, rateLimit } from "@/lib/security/rate-limit";
import {
  createAccessCode,
  revokeAccessCode,
  validateAccessCode,
  type CodeValidation,
} from "@/services/access/access-code-service";

/**
 * Access-code management actions (spec §9, §99, §100). Every authorization
 * decision (manager scope, expiry, usage limits, permission grants) is made by
 * the security-definer RPCs — never trusted from the client.
 */

export type AccessActionResult = { ok: true; code?: string } | { ok: false; error: string };

const createSchema = z.object({
  competitionId: z.uuid(),
  permissions: z.array(z.string().min(1)).min(1, "Select at least one permission"),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
  maxUses: z.coerce.number().int().positive().max(10000).optional().nullable(),
});

export async function createAccessCodeAction(
  input: unknown
): Promise<AccessActionResult> {
  await requireUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  try {
    const code = await createAccessCode(parsed.data);
    revalidatePath(`/competitions/${parsed.data.competitionId}/access`);
    return { ok: true, code };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not create access code.",
    };
  }
}

export async function revokeAccessCodeAction(input: {
  competitionId: string;
  codeId: string;
}): Promise<AccessActionResult> {
  await requireUser();
  const { competitionId, codeId } = z
    .object({ competitionId: z.uuid(), codeId: z.uuid() })
    .parse(input);
  try {
    await revokeAccessCode(codeId);
    revalidatePath(`/competitions/${competitionId}/access`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not revoke access code.",
    };
  }
}

/** Validates a code entered by a would-be participant (§99/§100). */
export async function validateAccessCodeAction(input: {
  competitionId: string;
  code: string;
}): Promise<CodeValidation> {
  const { competitionId, code } = z
    .object({ competitionId: z.uuid(), code: z.string().trim().min(1).max(40) })
    .parse(input);
  // Brute-force guard on the only unauthenticated, guessable endpoint (§89/§100).
  const limit = rateLimit(
    await clientRateKey("access-code", competitionId),
    10,
    5 * 60_000
  );
  if (!limit.ok) {
    return {
      valid: false,
      reason: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.`,
    };
  }
  return validateAccessCode(competitionId, code);
}
