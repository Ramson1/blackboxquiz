import { Building2, LayoutDashboard, Trophy, Users } from "lucide-react";
import { requireRole } from "@/features/auth/session";
import { effectiveRole } from "@/features/auth/session";
import {
  DashboardShell,
  type NavItem,
} from "@/components/dashboard/shell";

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Organizations", href: "/admin/organizations", icon: Building2 },
  { label: "Competitions", href: "/admin/competitions", icon: Trophy },
  { label: "Users", href: "/admin/users", icon: Users },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side role guard (spec §66) — RLS backs this up at the data layer.
  const user = await requireRole(["SUPER_ADMIN"]);

  return (
    <DashboardShell
      nav={NAV}
      areaLabel="Super Admin"
      user={{
        name: user.profile?.full_name || user.email || "Administrator",
        email: user.email,
        role: effectiveRole(user) ?? "SUPER_ADMIN",
      }}
    >
      {children}
    </DashboardShell>
  );
}
