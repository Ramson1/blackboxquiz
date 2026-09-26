import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { requireUser, effectiveRole } from "@/features/auth/session";
import { getCompetition } from "@/services/competitions/competition-service";
import { listAuditLogs, listAuditActions } from "@/services/admin/audit-service";
import { AuditLogViewer } from "@/components/admin/audit-log-viewer";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Audit log" };

const MANAGER_ROLES = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "COMPETITION_ADMIN",
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Immutable audit trail for a competition (spec §57, §114). Manager-only. */
export default async function CompetitionAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
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

  const sp = await searchParams;
  const asString = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const [logs, actions] = await Promise.all([
    listAuditLogs({
      competitionId: id,
      action: asString(sp.action),
      entityType: asString(sp.entityType),
      from: asString(sp.from),
      to: asString(sp.to),
      limit: 300,
    }),
    listAuditActions(id),
  ]);

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
          <ClipboardList className="size-5" /> Audit log
        </h1>
        <p className="text-sm text-muted-foreground">
          Immutable record of sensitive actions for {competition.name}.
        </p>
      </div>

      <Suspense>
        <AuditLogViewer logs={logs} actions={actions} />
      </Suspense>
    </div>
  );
}
