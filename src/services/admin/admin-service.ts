import { createClient } from "@/lib/supabase/server";
import type { Organization, Profile } from "@/types/database";
import type { AppRole, OrgMemberRole } from "@/lib/permissions/roles";

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

// ---------------------------------------------------------------------------
// Organization members (user assignment). RLS: super admins and organization
// admins may read/write blackboxquiz_organization_members (spec §66).
// ---------------------------------------------------------------------------

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgMemberRole;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  created_at: string;
  profile: Pick<Profile, "id" | "full_name" | "email" | "role"> | null;
}

export async function getOrganizationById(
  id: string
): Promise<Organization | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blackboxquiz_organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle<Organization>();
  return data;
}

export async function listOrganizationMembers(
  organizationId: string
): Promise<OrganizationMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_organization_members")
    .select(
      "id, organization_id, user_id, role, status, created_at, profile: blackboxquiz_profiles(id, full_name, email, role)"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data as unknown as OrganizationMember[];
}

/** Assign a user to an organization (re-activates and re-roles existing rows). */
export async function addOrganizationMember(input: {
  organizationId: string;
  userId: string;
  role: OrgMemberRole;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_organization_members")
    .upsert(
      {
        organization_id: input.organizationId,
        user_id: input.userId,
        role: input.role,
        status: "ACTIVE",
      },
      { onConflict: "organization_id,user_id" }
    )
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateMemberRole(memberId: string, role: OrgMemberRole) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("blackboxquiz_organization_members")
    .update({ role })
    .eq("id", memberId);
  if (error) throw new Error(error.message);
}

export async function removeOrganizationMember(memberId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("blackboxquiz_organization_members")
    .delete()
    .eq("id", memberId);
  if (error) throw new Error(error.message);
}
