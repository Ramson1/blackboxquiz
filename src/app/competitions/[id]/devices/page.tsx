import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MonitorCheck } from "lucide-react";
import { requireUser, effectiveRole } from "@/features/auth/session";
import { getCompetition } from "@/services/competitions/competition-service";
import { listDevices } from "@/services/devices/device-service";
import { DeviceManager } from "@/components/devices/device-manager";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Devices" };

const MANAGER_ROLES = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "COMPETITION_ADMIN",
] as const;

/** Device authorization control (spec §44). Manager-only. */
export default async function CompetitionDevicesPage({
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

  const devices = await listDevices(id);

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
          <MonitorCheck className="size-5" /> Devices
        </h1>
        <p className="text-sm text-muted-foreground">
          Authorize or revoke the consoles that may run {competition.name}. A
          revoked device is blocked from starting the competition.
        </p>
      </div>

      <DeviceManager competitionId={id} devices={devices} />
    </div>
  );
}
