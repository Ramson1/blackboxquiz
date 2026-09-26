import { createClient } from "@/lib/supabase/server";
import type { AuditLog } from "@/types/database";

/**
 * Audit log access (spec §57, §114). Rows are immutable and readable only
 * within the caller's authorized scope (RLS). Filtering supports action,
 * entity type, user, and a created-at date range.
 */

export interface AuditFilters {
  competitionId?: string;
  organizationId?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  from?: string; // ISO date (inclusive)
  to?: string; // ISO date (inclusive)
  limit?: number;
}

export async function listAuditLogs(
  filters: AuditFilters = {}
): Promise<AuditLog[]> {
  const supabase = await createClient();
  let query = supabase
    .from("blackboxquiz_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 200, 1000));

  if (filters.competitionId) query = query.eq("competition_id", filters.competitionId);
  if (filters.organizationId) query = query.eq("organization_id", filters.organizationId);
  if (filters.userId) query = query.eq("user_id", filters.userId);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.from) query = query.gte("created_at", new Date(filters.from).toISOString());
  if (filters.to) {
    // Include the whole "to" day.
    const end = new Date(filters.to);
    end.setUTCHours(23, 59, 59, 999);
    query = query.lte("created_at", end.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as AuditLog[];
}

/** Distinct actions already recorded, for populating the filter dropdown. */
export async function listAuditActions(competitionId?: string): Promise<string[]> {
  const supabase = await createClient();
  let query = supabase.from("blackboxquiz_audit_logs").select("action");
  if (competitionId) query = query.eq("competition_id", competitionId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const set = new Set<string>((data ?? []).map((r: { action: string }) => r.action));
  return [...set].sort();
}
