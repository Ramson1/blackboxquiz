import type { Metadata } from "next";
import { Building2, Radio, Trophy, Users } from "lucide-react";
import { getAdminStats } from "@/services/admin/admin-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Super Admin" };

export default async function AdminDashboardPage() {
  const stats = await getAdminStats();

  const cards = [
    {
      label: "Organizations",
      value: stats.organizations,
      icon: Building2,
    },
    { label: "Users", value: stats.users, icon: Users },
    { label: "Competitions", value: stats.competitions, icon: Trophy },
    {
      label: "Live now",
      value: stats.liveCompetitions,
      icon: Radio,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          System-wide overview of BLACKBOX QUIZ.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black tabular-nums">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
