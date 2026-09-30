"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { clientRateKey, rateLimit } from "@/lib/security/rate-limit";
import {
  createSetupInvite,
  deleteSetupInvite,
  reactivateSetupInvite,
  revokeSetupInvite,
  updateSetupInvite,
  type NewSetupInvite,
} from "@/services/invites/invite-service";

/**
 * Setup-invite management actions (migration 0012). Super admins / org admins
 * issue a /setup/<token> link + password for a school; the RPCs enforce who
 * may act on which organization.
 */

export type InviteActionResult =
  | { ok: true; invite?: NewSetupInvite }
  | { ok: false; error: string };

export type InviteEditResult =
  | { ok: true; rotated: boolean; password: string | null }
  | { ok: false; error: string };

const createSchema = z.object({
  organizationId: z.uuid(),
  password: z.string().trim().min(4, "Password must be at least 4 characters").max(72),
  label: z.string().trim().max(120).optional().nullable(),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export async function createSetupInviteAction(
  input: unknown
): Promise<InviteActionResult> {
  await requireUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  // Belt-and-braces on top of the DB gate: keep invite spam slow per client.
  const limit = rateLimit(
    await clientRateKey("invite-create", parsed.data.organizationId),
    20,
    15 * 60_000
  );
  if (!limit.ok) {
    return { ok: false, error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` };
  }
  try {
    const invite = await createSetupInvite(parsed.data);
    revalidatePath("/admin/invites");
    return { ok: true, invite };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not create setup invite.",
    };
  }
}

export async function revokeSetupInviteAction(input: {
  inviteId: string;
}): Promise<InviteActionResult> {
  await requireUser();
  const { inviteId } = z.object({ inviteId: z.uuid() }).parse(input);
  try {
    await revokeSetupInvite(inviteId);
    revalidatePath("/admin/invites");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not revoke setup invite.",
    };
  }
}

const editSchema = z.object({
  inviteId: z.uuid(),
  label: z.string().trim().max(120),
  // Browser datetime-local values carry no UTC offset, so validate loosely and
  // convert to ISO here rather than reusing the strict create-shape rule.
  expiresAt: z.string().trim().optional(),
  password: z.string().trim().max(72).optional(),
});

export async function editSetupInviteAction(
  input: unknown
): Promise<InviteEditResult> {
  await requireUser();
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { inviteId, label, expiresAt, password } = parsed.data;

  let expiresIso: string | null = null;
  if (expiresAt) {
    const d = new Date(expiresAt);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "Invalid expiry date" };
    }
    expiresIso = d.toISOString();
  }

  try {
    const res = await updateSetupInvite({
      inviteId,
      label: label.trim() || null,
      expiresAt: expiresIso,
      password: password && password.length > 0 ? password : null,
    });
    revalidatePath("/admin/invites");
    return { ok: true, rotated: res.rotated, password: res.password };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not update setup invite.",
    };
  }
}

export async function reactivateSetupInviteAction(input: {
  inviteId: string;
}): Promise<InviteActionResult> {
  await requireUser();
  const { inviteId } = z.object({ inviteId: z.uuid() }).parse(input);
  try {
    await reactivateSetupInvite(inviteId);
    revalidatePath("/admin/invites");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not reactivate setup invite.",
    };
  }
}

export async function deleteSetupInviteAction(input: {
  inviteId: string;
}): Promise<InviteActionResult> {
  await requireUser();
  const { inviteId } = z.object({ inviteId: z.uuid() }).parse(input);
  try {
    await deleteSetupInvite(inviteId);
    revalidatePath("/admin/invites");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete setup invite.",
    };
  }
}
