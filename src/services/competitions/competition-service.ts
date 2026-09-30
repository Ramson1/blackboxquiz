import { createClient } from "@/lib/supabase/server";
import type {
  Competition,
  Organization,
  PointValue,
  Question,
  Team,
} from "@/types/database";
import type { CompetitionStatus } from "@/lib/permissions/roles";

/** Competition data access (spec §71/§72). Never call Supabase from components. */

export async function listCompetitions(): Promise<Competition[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_competitions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Competition[];
}

/** Super Admin view: every competition with its organization name. */
export async function listAllCompetitionsForAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_competitions")
    .select("*, organization: blackboxquiz_organizations(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as (Competition & { organization: { name: string } | null })[];
}

export async function getCompetition(id: string): Promise<Competition | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blackboxquiz_competitions")
    .select("*")
    .eq("id", id)
    .maybeSingle<Competition>();
  return data;
}

/** Resolve an organization's display name for exports/branding (spec §60). */
export async function getOrganizationName(
  organizationId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blackboxquiz_organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle<{ name: string }>();
  return data?.name ?? null;
}

export async function listManagedOrganizations(): Promise<Organization[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_organizations")
    .select("*")
    .eq("status", "ACTIVE")
    .order("name");
  if (error) throw new Error(error.message);
  return data as Organization[];
}

export async function createCompetition(input: {
  organizationId: string;
  name: string;
  description?: string;
  scheduledAt?: string;
  timezone?: string;
  defaultTimeLimit: number;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_create_competition", {
    p_organization_id: input.organizationId,
    p_name: input.name,
    p_description: input.description ?? null,
    p_scheduled_at: input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null,
    p_timezone: input.timezone ?? "UTC",
    p_default_time_limit: input.defaultTimeLimit,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function setCompetitionStatus(
  id: string,
  status: CompetitionStatus
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("blackboxquiz_set_competition_status", {
    p_competition_id: id,
    p_new_status: status,
  });
  if (error) throw new Error(error.message);
}

/**
 * Edit competition details (name/description/schedule/timer). RLS requires
 * blackboxquiz_can_manage_competition(id); the slug stays stable so existing
 * links keep working after a rename.
 */
export async function updateCompetition(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    scheduledAt?: string | null;
    defaultTimeLimit?: number;
  }
): Promise<void> {
  const supabase = await createClient();
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.scheduledAt !== undefined) updates.scheduled_at = patch.scheduledAt;
  if (patch.defaultTimeLimit !== undefined)
    updates.default_time_limit = patch.defaultTimeLimit;
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase
    .from("blackboxquiz_competitions")
    .update(updates)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Hard delete — SUPER_ADMIN only per RLS; cascades teams/questions/attempts. */
export async function deleteCompetition(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("blackboxquiz_competitions")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function lockCompetition(id: string, reason: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("blackboxquiz_lock_competition", {
    p_competition_id: id,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function unlockCompetition(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("blackboxquiz_unlock_competition", {
    p_competition_id: id,
  });
  if (error) throw new Error(error.message);
}

export async function validateCompetitionStart(
  id: string
): Promise<{ ok: boolean; issues: string[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_validate_competition_start", {
    p_competition_id: id,
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; issues: string[] };
}

export async function hasActiveLock(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blackboxquiz_competition_locks")
    .select("id")
    .eq("competition_id", id)
    .eq("locked", true)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Active lock state for many competitions in one query (admin list). */
export async function getLockedCompetitionIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blackboxquiz_competition_locks")
    .select("competition_id")
    .eq("locked", true);
  return new Set((data ?? []).map((r: { competition_id: string }) => r.competition_id));
}

export async function getCompetitionSummary(id: string) {
  const supabase = await createClient();
  const [teams, questions, points] = await Promise.all([
    supabase
      .from("blackboxquiz_teams")
      .select("*")
      .eq("competition_id", id)
      .order("display_order"),
    supabase
      .from("blackboxquiz_questions")
      .select("id", { count: "exact", head: true })
      .eq("competition_id", id),
    supabase
      .from("blackboxquiz_point_values")
      .select("*")
      .eq("competition_id", id)
      .order("display_order"),
  ]);
  return {
    teams: (teams.data ?? []) as Team[],
    questionCount: questions.count ?? 0,
    pointValues: (points.data ?? []) as PointValue[],
  };
}

export type { Competition, Team, Question, PointValue };
