"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createOrganization,
  updateOrganization,
  updateUserRole,
  updateUserStatus,
} from "@/services/admin/admin-service";
import {
  adjustScore,
  type AdjustmentResult,
} from "@/services/admin/score-adjustment-service";
import { emergencyLock } from "@/services/admin/lock-service";
import { requireUser } from "@/features/auth/session";
import { logAudit } from "@/services/admin/audit";
import { APP_ROLES, type AppRole } from "@/lib/permissions/roles";

export type AdminActionResult = { ok: true } | { ok: false; error: string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

const orgSchema = z.object({
  name: z.string().min(2, "Organization name is too short").max(120),
});

export async function createOrganizationAction(
  input: z.infer<typeof orgSchema>
): Promise<AdminActionResult> {
  const parsed = orgSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  try {
    const org = await createOrganization({
      name: parsed.data.name,
      slug: slugify(parsed.data.name),
    });
    await logAudit({
      organizationId: org.id,
      action: "ORGANIZATION_CREATED",
      entityType: "organization",
      entityId: org.id,
      newValue: { name: org.name, slug: org.slug },
    });
    revalidatePath("/admin/organizations");
    revalidatePath("/admin/dashboard");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("duplicate key")) {
      return { ok: false, error: "An organization with that name already exists." };
    }
    return { ok: false, error: "Could not create organization." };
  }
}

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED"]),
});

export async function setOrganizationStatusAction(
  input: z.infer<typeof statusSchema>
): Promise<AdminActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid organization id." };
  try {
    const org = await updateOrganization(parsed.data.id, {
      status: parsed.data.status,
    });
    await logAudit({
      organizationId: org.id,
      action: `ORGANIZATION_${parsed.data.status}`,
      entityType: "organization",
      entityId: org.id,
      newValue: { status: parsed.data.status },
    });
    revalidatePath("/admin/organizations");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not update organization." };
  }
}

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(APP_ROLES),
});

export async function changeUserRoleAction(
  input: z.infer<typeof roleSchema>
): Promise<AdminActionResult> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid role." };
  try {
    await updateUserRole(parsed.data.userId, parsed.data.role as AppRole);
    await logAudit({
      action: "USER_ROLE_CHANGED",
      entityType: "profile",
      entityId: parsed.data.userId,
      newValue: { role: parsed.data.role },
    });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not change user role." };
  }
}

const userStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

export async function setUserStatusAction(
  input: z.infer<typeof userStatusSchema>
): Promise<AdminActionResult> {
  const parsed = userStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid user." };
  try {
    await updateUserStatus(parsed.data.userId, parsed.data.status);
    await logAudit({
      action: `USER_${parsed.data.status}`,
      entityType: "profile",
      entityId: parsed.data.userId,
      newValue: { status: parsed.data.status },
    });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not update user." };
  }
}

// ----------------------------------------------------------------------------
// Score adjustment + emergency lock (spec §56, §101, §102). Authorization and
// audit logging happen inside the SECURITY DEFINER RPCs — never trusted here.
// ----------------------------------------------------------------------------

const adjustSchema = z.object({
  competitionId: z.uuid(),
  teamId: z.uuid(),
  adjustment: z
    .coerce
    .number()
    .int("Whole points only")
    .refine((n) => n !== 0, "Adjustment cannot be zero"),
  reason: z.string().trim().min(3, "A reason is required").max(500),
});

export type AdjustScoreResult =
  | { ok: true; result: AdjustmentResult }
  | { ok: false; error: string };

export async function adjustScoreAction(
  input: unknown
): Promise<AdjustScoreResult> {
  await requireUser();
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { competitionId, teamId, adjustment, reason } = parsed.data;
  try {
    const result = await adjustScore({ teamId, adjustment, reason });
    revalidatePath(`/competitions/${competitionId}`);
    revalidatePath(`/competitions/${competitionId}/scoreboard`);
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not adjust score.",
    };
  }
}

export async function emergencyLockAction(input: {
  competitionId: string;
  reason: string;
}): Promise<AdminActionResult> {
  await requireUser();
  const parsed = z
    .object({
      competitionId: z.uuid(),
      reason: z.string().trim().min(3, "A reason is required").max(500),
    })
    .parse(input);
  try {
    await emergencyLock(parsed.competitionId, parsed.reason);
    revalidatePath(`/competitions/${parsed.competitionId}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not lock competition.",
    };
  }
}
