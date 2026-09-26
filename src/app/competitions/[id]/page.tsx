import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Activity, KeyRound, Monitor, MonitorCheck, RadioTower, Trophy } from "lucide-react";
import { requireUser, effectiveRole } from "@/features/auth/session";
import {
  getCompetition,
  getCompetitionSummary,
  hasActiveLock,
  validateCompetitionStart,
} from "@/services/competitions/competition-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { statusLabel } from "@/features/competitions/lifecycle";
import { StatusControls } from "@/app/competitions/[id]/status-controls";
import { CompetitionControlPanel } from "@/components/admin/competition-control-panel";
import { DownloadPanel } from "@/components/offline/download-panel";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Competition" };

export default async function CompetitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const role = effectiveRole(user);
  const canManage =
    role === "SUPER_ADMIN" ||
    role === "ORGANIZATION_ADMIN" ||
    role === "COMPETITION_ADMIN";
  const competition = await getCompetition(id);
  if (!competition) notFound();

  const [summary, locked, readiness] = await Promise.all([
    getCompetitionSummary(id),
    hasActiveLock(id),
    validateCompetitionStart(id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{competition.name}</h1>
        <p className="text-sm text-muted-foreground">
          {competition.description || "No description"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Badge
              className={
                competition.status === "LIVE"
                  ? "bg-emerald-500 text-white"
                  : undefined
              }
            >
              {statusLabel(competition.status)}
            </Badge>
            {locked && (
              <Badge className="bg-red-600 text-white">LOCKED</Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Teams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black tabular-nums">
              {summary.teams.length}/2
            </p>
            {summary.teams.map((t) => (
              <p key={t.id} className="truncate text-xs text-muted-foreground">
                {t.name}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black tabular-nums">
              {summary.questionCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Scheduled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {competition.scheduled_at
                ? format(
                    new Date(competition.scheduled_at),
                    "d MMM yyyy, HH:mm"
                  )
                : "Not scheduled"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Start readiness</CardTitle>
        </CardHeader>
        <CardContent>
          {readiness.ok ? (
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              ✓ All checks passed — this competition can start once the device
              downloads the package.
            </p>
          ) : (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
              {readiness.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Offline mode</CardTitle>
        </CardHeader>
        <CardContent>
          <DownloadPanel
            competitionId={competition.id}
            offlineHref={`/competitions/${competition.id}/live/offline`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Point values</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {summary.pointValues.map((pv) => (
            <span
              key={pv.id}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold text-white"
              style={{ backgroundColor: pv.color }}
            >
              {pv.points.toLocaleString()}
            </span>
          ))}
        </CardContent>
      </Card>

      <StatusControls
        competitionId={competition.id}
        status={competition.status}
        locked={locked}
      />

      {canManage && (
        <CompetitionControlPanel
          competitionId={competition.id}
          teams={summary.teams}
          isSuperAdmin={role === "SUPER_ADMIN"}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Manage</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            render={<Link href={`/competitions/${competition.id}/questions`} />}
          >
            Questions ({summary.questionCount})
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/competitions/${competition.id}/teams`} />}
          >
            Teams &amp; points ({summary.teams.length}/2)
          </Button>
          <Button
            render={<Link href={`/competitions/${competition.id}/live`} />}
          >
            <RadioTower className="size-4" />
            Go Live
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/competitions/${competition.id}/scoreboard`} />}
          >
            <Monitor className="size-4" />
            Scoreboard
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/competitions/${competition.id}/results`} />}
          >
            <Trophy className="size-4" />
            Results
          </Button>
          {canManage && (
            <>
              <Button
                variant="outline"
                render={<Link href={`/competitions/${competition.id}/access`} />}
              >
                <KeyRound className="size-4" />
                Access codes
              </Button>
              <Button
                variant="outline"
                render={
                  <Link href={`/competitions/${competition.id}/devices`} />
                }
              >
                <MonitorCheck className="size-4" />
                Devices
              </Button>
              <Button
                variant="outline"
                render={
                  <Link href={`/competitions/${competition.id}/monitor`} />
                }
              >
                <Activity className="size-4" />
                Live monitor
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
