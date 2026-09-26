import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";
import { requireUser, effectiveRole } from "@/features/auth/session";
import { getCompetition } from "@/services/competitions/competition-service";
import { listAccessCodes } from "@/services/access/access-code-service";
import { AccessCodesManager } from "@/components/access/access-codes-manager";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Access codes" };

const MANAGER_ROLES = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "COMPETITION_ADMIN",
] as const;

/** Competition access-code control (spec §9, §99, §100). Manager-only. */
export default async function CompetitionAccessPage({
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

  const codes = await listAccessCodes(id);

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
          <KeyRound className="size-5" /> Competition access
        </h1>
        <p className="text-sm text-muted-foreground">
          Issue and manage scoped access codes for {competition.name}.
        </p>
      </div>

      <AccessCodesManager competitionId={id} codes={codes} />
    </div>
  );
}
