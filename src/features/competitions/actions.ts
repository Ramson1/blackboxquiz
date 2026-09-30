"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createCompetition,
  deleteCompetition,
  lockCompetition,
  setCompetitionStatus,
  unlockCompetition,
  updateCompetition,
} from "@/services/competitions/competition-service";
import { requireRole, requireUser } from "@/features/auth/session";
import { logAudit } from "@/services/admin/audit";
import { COMPETITION_STATUSES, type CompetitionStatus } from "@/lib/permissions/roles";

export type CompetitionActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const createSchema = z.object({
  organizationId: z.uuid("Select an organization"),
  name: z.string().min(3, "Name must be at least 3 characters").max(120),
  description: z.string().max(2000).optional().or(z.literal("")),
  scheduledAt: z.string().optional().or(z.literal("")),
  defaultTimeLimit: z.coerce
    .number()
    .int("Must be a whole number of seconds")
    .min(5, "Minimum 5 seconds")
    .max(600, "Maximum 600 seconds"),
});

export async function createCompetitionAction(
  input: unknown
): Promise<CompetitionActionResult> {
  await requireRole(["SUPER_ADMIN", "ORGANIZATION_ADMIN"]);
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  try {
    const id = await createCompetition({
      organizationId: parsed.data.organizationId,
      name: parsed.data.name,
      description: parsed.data.description || undefined,
      scheduledAt: parsed.data.scheduledAt || undefined,
      defaultTimeLimit: parsed.data.defaultTimeLimit,
    });
    revalidatePath("/competitions");
    revalidatePath("/admin/competitions");
    redirect(`/competitions/${id}`);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not create competition.",
    };
  }
}

const statusSchema = z.object({
  competitionId: z.uuid(),
  status: z.enum(COMPETITION_STATUSES),
});

export async function setCompetitionStatusAction(
  input: unknown
): Promise<CompetitionActionResult> {
  await requireUser();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { competitionId, status } = parsed.data;
  try {
    await setCompetitionStatus(competitionId, status as CompetitionStatus);
    revalidatePath(`/competitions/${competitionId}`);
    revalidatePath("/competitions");
    revalidatePath("/admin/competitions");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not change status.",
    };
  }
}

const updateSchema = z.object({
  competitionId: z.uuid(),
  organizationId: z.uuid(),
  name: z.string().min(3, "Name must be at least 3 characters").max(120),
  description: z.string().max(2000).optional().or(z.literal("")),
  scheduledAt: z.string().optional().or(z.literal("")),
  defaultTimeLimit: z.coerce
    .number()
    .int("Must be a whole number of seconds")
    .min(5, "Minimum 5 seconds")
    .max(600, "Maximum 600 seconds"),
});

export async function updateCompetitionAction(
  input: unknown
): Promise<CompetitionActionResult> {
  await requireUser();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { competitionId, organizationId, name, description, scheduledAt, defaultTimeLimit } =
    parsed.data;
  try {
    // RLS (blackboxquiz_can_manage_competition) decides who may edit this row.
    await updateCompetition(competitionId, {
      name,
      description: description || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      defaultTimeLimit,
    });
    await logAudit({
      organizationId,
      competitionId,
      action: "COMPETITION_UPDATED",
      entityType: "competition",
      entityId: competitionId,
      newValue: { name, scheduled_at: scheduledAt || null, default_time_limit: defaultTimeLimit },
    });
    revalidatePath(`/competitions/${competitionId}`);
    revalidatePath("/competitions");
    revalidatePath("/admin/competitions");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not update competition.",
    };
  }
}

export async function deleteCompetitionAction(input: {
  competitionId: string;
  organizationId: string;
}): Promise<CompetitionActionResult> {
  await requireUser();
  const parsed = z
    .object({ competitionId: z.uuid(), organizationId: z.uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid competition id." };
  try {
    // RLS restricts competition deletes to SUPER_ADMIN; teams, questions and
    // attempts cascade with it.
    await deleteCompetition(parsed.data.competitionId);
    await logAudit({
      organizationId: parsed.data.organizationId,
      competitionId: parsed.data.competitionId,
      action: "COMPETITION_DELETED",
      entityType: "competition",
      entityId: parsed.data.competitionId,
    });
    revalidatePath("/competitions");
    revalidatePath("/admin/competitions");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete competition.",
    };
  }
}

const lockSchema = z.object({
  competitionId: z.uuid(),
  locked: z.boolean(),
  reason: z.string().max(500).optional(),
});

export async function setCompetitionLockAction(
  input: unknown
): Promise<CompetitionActionResult> {
  await requireUser();
  const parsed = lockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    if (parsed.data.locked) {
      await lockCompetition(
        parsed.data.competitionId,
        parsed.data.reason || "Locked by administrator"
      );
    } else {
      await unlockCompetition(parsed.data.competitionId);
    }
    revalidatePath(`/competitions/${parsed.data.competitionId}`);
    revalidatePath("/competitions");
    revalidatePath("/admin/competitions");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not change lock state.",
    };
  }
}
