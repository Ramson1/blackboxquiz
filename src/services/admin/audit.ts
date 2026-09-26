import { createClient } from "@/lib/supabase/server";

/** Append an immutable audit entry (spec §57). Best-effort: never breaks the
 *  calling operation, failures are surfaced only in server logs. */
export async function logAudit(entry: {
  organizationId?: string | null;
  competitionId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason?: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("blackboxquiz_audit_logs").insert({
      organization_id: entry.organizationId ?? null,
      competition_id: entry.competitionId ?? null,
      user_id: user?.id ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      reason: entry.reason ?? null,
    });
    if (error) console.error("[audit]", error.message);
  } catch (e) {
    console.error("[audit]", e);
  }
}
