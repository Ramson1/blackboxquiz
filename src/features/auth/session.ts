import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/permissions/roles";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: AppRole | null;
};

export type SessionUser = {
  id: string;
  email: string | null;
  profile: Profile | null;
  /** Highest organization-level role across memberships. */
  organizationRoles: { organizationId: string; role: AppRole }[];
};

/** Effective role: global profile role wins, else best org membership role. */
export function effectiveRole(user: SessionUser): AppRole | null {
  if (user.profile?.role) return user.profile.role;
  const admin = user.organizationRoles.find(
    (r) => r.role === "ORGANIZATION_ADMIN"
  );
  if (admin) return "ORGANIZATION_ADMIN";
  return user.organizationRoles[0]?.role ?? null;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("blackboxquiz_profiles")
    .select("id, full_name, email, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  const { data: memberships } = await supabase
    .from("blackboxquiz_organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE");

  return {
    id: user.id,
    email: user.email ?? null,
    profile: profile ?? null,
    organizationRoles: (memberships ?? []).map((m: { organization_id: string; role: AppRole }) => ({
      organizationId: m.organization_id,
      role: m.role,
    })),
  };
});

/** Server-side guard: throws redirect to /login when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");
  return sessionUser;
}

/** Server-side guard for a specific role set (spec: never rely on UI checks). */
export async function requireRole(roles: AppRole[]): Promise<SessionUser> {
  const sessionUser = await requireUser();
  const role = effectiveRole(sessionUser);
  if (!role || !roles.includes(role)) redirect("/login?error=unauthorized");
  return sessionUser;
}
