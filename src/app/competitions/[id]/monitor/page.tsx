import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Activity, ArrowLeft } from "lucide-react";
import { requireUser, effectiveRole } from "@/features/auth/session";
import { getCompetition } from "@/services/competitions/competition-service";
import { listRecentEvents } from "@/services/live/live-service";
import { RealtimeMonitor } from "@/components/admin/realtime-monitor";
import { BrandFooter } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Live monitor" };

const MANAGER_ROLES = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "COMPETITION_ADMIN",
] as const;

/**
 * Admin realtime monitor (spec §28, §797). Manager-only observation of the live
 * event stream; never part of the scoreboard's critical path.
 */
export default async function CompetitionMonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const role = effectiveRole(user);
  if (
    !role ||
    !MANAGER_ROLES.includes(role as (typeof MANAGER_ROLES)[number])
  )
    redirect("/login?error=unauthorized");

  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();

  const events = await listRecentEvents(id, 50);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
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
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Activity className="size-5 text-emerald-500" /> Live monitor
        </h1>
        <p className="text-sm text-muted-foreground">
          Realtime view of {competition.name}&apos;s committed events.
        </p>
      </div>

      <RealtimeMonitor competitionId={id} seedEvents={events} />

      <BrandFooter />
    </div>
  );
}
