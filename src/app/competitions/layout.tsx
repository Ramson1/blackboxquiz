import { effectiveRole, requireUser } from "@/features/auth/session";
import {
  DashboardShell,
  type NavItem,
} from "@/components/dashboard/shell";

const NAV: NavItem[] = [
  { label: "Competitions", href: "/competitions", icon: "trophy" },
];

export default async function CompetitionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <DashboardShell
      nav={NAV}
      areaLabel="Competition Admin"
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
