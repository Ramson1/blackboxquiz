import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, WifiOff } from "lucide-react";
import { requireUser, effectiveRole } from "@/features/auth/session";
import { getCompetition } from "@/services/competitions/competition-service";
import { OfflineLive } from "@/components/live/offline-live";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Offline console" };

const OPERATOR_ROLES = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "COMPETITION_ADMIN",
  "COMPETITION_OPERATOR",
] as const;

/**
 * Offline live console route (spec §29–§33). The page shell is gated and
 * resolved online, but once the package is downloaded the console itself runs
 * entirely from IndexedDB — no server data is required to operate the show.
 */
export default async function CompetitionOfflinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const role = effectiveRole(user);
  if (
    !role ||
    !OPERATOR_ROLES.includes(role as (typeof OPERATOR_ROLES)[number])
  )
    redirect("/login?error=unauthorized");

  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();

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
          <WifiOff className="size-5 text-amber-600" /> Offline console
        </h1>
        <p className="text-sm text-muted-foreground">
          Runs from data stored on this device. Download the package first, then
          operate the competition with or without internet.
        </p>
      </div>

      <OfflineLive competitionId={id} />
    </div>
  );
}
