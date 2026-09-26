import type { Metadata } from "next";
import Link from "next/link";
import { listCompetitions, listManagedOrganizations } from "@/services/competitions/competition-service";
import { requireUser } from "@/features/auth/session";
import { effectiveRole } from "@/features/auth/session";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/features/competitions/lifecycle";
import { CreateCompetitionDialog } from "@/app/competitions/create-dialog";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Competitions" };

const LIVE_STATUSES = new Set(["LIVE", "PAUSED", "DOWNLOADING", "DOWNLOADED"]);

export default async function CompetitionsPage() {
  const user = await requireUser();
  const role = effectiveRole(user);
  const canCreate = role === "SUPER_ADMIN" || role === "ORGANIZATION_ADMIN";
  const [competitions, organizations] = await Promise.all([
    listCompetitions(),
    canCreate ? listManagedOrganizations() : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Competitions</h1>
          <p className="text-sm text-muted-foreground">
            Academic competitions available to your account.
          </p>
        </div>
        {canCreate && <CreateCompetitionDialog organizations={organizations} />}
      </div>

      {competitions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No competitions yet.
            {canCreate && " Create the first one to get started."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {competitions.map((c) => (
            <Link key={c.id} href={`/competitions/${c.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">
                      {c.name}
                    </CardTitle>
                    <Badge
                      className={
                        LIVE_STATUSES.has(c.status)
                          ? "shrink-0 bg-emerald-500 text-white"
                          : "shrink-0"
                      }
                      variant={
                        LIVE_STATUSES.has(c.status)
                          ? "default"
                          : "secondary"
                      }
                    >
                      {statusLabel(c.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {c.scheduled_at
                    ? `Scheduled ${format(new Date(c.scheduled_at), "d MMM yyyy, HH:mm")}`
                    : "Not scheduled"}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
