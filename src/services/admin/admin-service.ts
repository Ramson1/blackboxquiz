import { createClient } from "@/lib/supabase/server";
import type { Organization, Profile } from "@/types/database";
import type { AppRole } from "@/lib/permissions/roles";

/**
 * Super Admin data access (spec §7). Raw Supabase calls never appear in
 * components (spec §71). RLS enforces that only SUPER_ADMIN passes here;
 * the layout guard is only a fast-fail convenience.
 */

export async function getAdminStats() {
  const supabase = await createClient();
  const [orgs, users, comps, live] = await Promise.all([
    supabase.from("blackboxquiz_organizations").select("id", { count: "exact", head: true }),
    supabase.from("blackboxquiz_profiles").select("id", { count: "exact", head: true }),
    supabase.from("blackboxquiz_competitions").select("id", { count: "exact", head: true }),
    supabase
      .from("blackboxquiz_competitions")
      .select("id", { count: "exact", head: true })
      .in("status", ["LIVE", "PAUSED"]),
  ]);
  if (orgs.error) throw new Error(orgs.error.message);
  return {
    organizations: orgs.count ?? 0,
    users: users.count ?? 0,
    competitions: comps.count ?? 0,
    liveCompetitions: live.count ?? 0,
  };
}

export async function listOrganizations() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_organizations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Organization[];
}

export async function createOrganization(input: { name: string; slug: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_organizations")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Organization;
}

export async function updateOrganization(
  id: string,
  patch: Partial<Pick<Organization, "name" | "slug" | "logo_url" | "status">>
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_organizations")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Organization;
}

export async function listUsers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Profile[];
}

export async function updateUserRole(userId: string, role: AppRole) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("blackboxquiz_profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function updateUserStatus(
  userId: string,
  status: "ACTIVE" | "DISABLED"
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("blackboxquiz_profiles")
    .update({ status })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}
