import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser, effectiveRole } from "@/features/auth/session";
import { getCompetition } from "@/services/competitions/competition-service";
import { listTeams } from "@/services/teams/team-service";
import { listPointValues } from "@/services/teams/point-value-service";
import { TeamsManager } from "@/app/competitions/[id]/teams/teams-manager";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Teams & Point Values" };

export default async function CompetitionTeamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();

  const role = effectiveRole(user);
  const canManage = role === "SUPER_ADMIN" || role === "ORGANIZATION_ADMIN";

  const [teams, pointValues] = await Promise.all([
    listTeams(id),
    listPointValues(id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit text-muted-foreground"
          render={<Link href={`/competitions/${id}`} />}
        >
          <ArrowLeft />
          Back to {competition.name}
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          Teams &amp; point values
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure the two competing teams and the point tiers used on the
          question board.
        </p>
      </div>

      <TeamsManager
        competitionId={id}
        canManage={canManage}
        teams={teams}
        pointValues={pointValues}
      />
    </div>
  );
}
