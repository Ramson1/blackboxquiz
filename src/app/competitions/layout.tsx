import {
  effectiveRole,
  requireUser,
} from "@/features/auth/session";
import {
  DashboardShell,
  type NavItem,
} from "@/components/dashboard/shell";

const WORKSPACE_NAV: NavItem[] = [
  { label: "Competitions", href: "/competitions", icon: "trophy" },
];

// Super admins reach the workspace from the admin dashboard — keep the full
// admin sidebar so navigation never collapses to a single link. "Competitions"
// here is the workspace itself, so the admin "Competitions" (admin CRUD) item
// is replaced by "Quiz Workspace" at the active /competitions href.
const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: "dashboard" },
  { label: "Organizations", href: "/admin/organizations", icon: "organizations" },
  { label: "Setup Invites", href: "/admin/invites", icon: "link" },
  { label: "Competitions", href: "/admin/competitions", icon: "trophy" },
  { label: "Quiz Workspace", href: "/competitions", icon: "workspace" },
  { label: "Users", href: "/admin/users", icon: "users" },
];

export default async function CompetitionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const isAdmin = effectiveRole(user) === "SUPER_ADMIN";

  return (
    <DashboardShell
      nav={isAdmin ? ADMIN_NAV : WORKSPACE_NAV}
      areaLabel={isAdmin ? "Super Admin" : "Competition Admin"}
      user={{
        name: user.profile?.full_name || user.email || "Organizer",
        email: user.email,
        role: effectiveRole(user) ?? "VIEWER",
      }}
    >
      {children}
    </DashboardShell>
  );
}
