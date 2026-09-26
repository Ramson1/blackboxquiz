"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import type { DeviceStatus } from "@/services/devices/device-service";
import { useOfflineCompetition } from "@/features/offline/use-offline-live-engine";
import { useOfflineSync, type OfflineSync } from "@/features/offline/use-offline-sync";
import { useDeviceStatus } from "@/features/offline/use-device-status";
import { LiveConsoleView } from "@/components/live/live-console";
import { ConnectionBadge } from "@/components/live/scoreboard";
import { DownloadPanel } from "@/components/offline/download-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Offline live console (spec §29–§33, §40–§43). Runs entirely from the locally
 * downloaded package + IndexedDB event log, so a refresh or crash recovers the
 * exact running state. A background sync engine drains the queue to the server
 * whenever a connection is available — without ever interrupting the show.
 */
export function OfflineLive({ competitionId }: { competitionId: string }) {
  const sync = useOfflineSync(competitionId);
  const device = useDeviceStatus(competitionId);
  const oc = useOfflineCompetition(competitionId, {
    onEventsAppended: sync.syncNow,
  });
  const [resumed, setResumed] = useState(false);

  // §44 — a revoked device must not run the competition.
  if (!device.loading && !device.allowed) {
    return <DeviceBlocked competitionId={competitionId} onRetry={device.refresh} />;
  }

  if (oc.status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading offline package…
      </div>
    );
  }

  if (oc.status === "missing" || oc.status === "incomplete") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <CloudOff className="size-8 text-amber-600" />
            <h2 className="text-lg font-bold">Not available offline yet</h2>
            <p className="text-sm text-muted-foreground">
              Download the competition package before running it without a
              connection. You can start the moment it shows{" "}
              <span className="font-semibold">READY</span>.
            </p>
          </CardContent>
        </Card>
        <DownloadPanel competitionId={competitionId} onComplete={oc.reload} />
      </div>
    );
  }

  const engine = oc.engine;
  if (!engine) return null;

  // §43 — a session recovered from IndexedDB that was mid-competition.
  const recovered =
    engine.state.status === "LIVE" || engine.state.status === "PAUSED";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ConnectionBadge />
        <div className="flex items-center gap-3">
          <DeviceStatusPill status={device.status} />
          <SyncStatus sync={sync} />
        </div>
      </div>

      {recovered && !resumed ? (
        <RecoveryGate
          competitionId={competitionId}
          competitionName={oc.competitionName}
          description={describeSession(oc, engine.state)}
          onResume={() => setResumed(true)}
        />
      ) : (
        <LiveConsoleView
          engine={engine}
          competitionId={competitionId}
          competitionName={oc.competitionName}
          contentMap={oc.contentMap}
          pointColors={oc.pointColors}
          allowBonus={oc.allowBonus}
        />
      )}
    </div>
  );
}

function describeSession(
  oc: ReturnType<typeof useOfflineCompetition>,
  state: NonNullable<typeof oc.engine>["state"]
): string {
  const active = state.active;
  if (!active) return state.status === "PAUSED" ? "Paused" : "In progress";
  const qNumber = state.questions.find(
    (q) => q.id === active.questionId
  )?.questionNumber;
  const team = state.teams.find((t) => t.id === active.primaryTeamId)?.name;
  const phase = active.phase.replace("_", " ").toLowerCase();
  return `Question ${qNumber ?? ""} — ${team ?? ""} — ${phase}`.trim();
}

function SyncStatus({ sync }: { sync: OfflineSync }) {
  if (sync.conflicts > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
        <AlertTriangle className="size-3.5" />
        {sync.conflicts} sync conflict{sync.conflicts > 1 ? "s" : ""} — review
        needed
      </span>
    );
  }
  if (!sync.online) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <CloudOff className="size-3.5" />
        Offline — all actions saved locally
      </span>
    );
  }
  if (sync.pending > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCw className="size-3.5 animate-spin" />
        Synchronizing {sync.pending} event{sync.pending > 1 ? "s" : ""}…
      </span>
    );
  }
  if (sync.lastSyncedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5" />
        Competition data is up to date
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Synced</span>;
}

function RecoveryGate({
  competitionId,
  competitionName,
  description,
  onResume,
}: {
  competitionId: string;
  competitionName: string;
  description: string;
  onResume: () => void;
}) {
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <AlertTriangle className="size-9 text-amber-600" />
        <div>
          <h2 className="text-xl font-bold">Previous competition session detected</h2>
          <p className="text-sm text-muted-foreground">Competition: {competitionName}</p>
          {description && (
            <p className="mt-1 text-sm font-medium">State: {description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={onResume}>
            <Play /> Resume competition
          </Button>
          <Button variant="outline" render={<Link href={`/competitions/${competitionId}`} />}>
            Exit session
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Requires operator confirmation before continuing.
        </p>
      </CardContent>
    </Card>
  );
}

/** §44 — a revoked device cannot start or advance the competition. */
function DeviceBlocked({
  competitionId,
  onRetry,
}: {
  competitionId: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <Card className="border-red-500/40 bg-red-500/5">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <ShieldAlert className="size-9 text-red-600" />
          <div>
            <h2 className="text-xl font-bold">Device authorization revoked</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This device is not allowed to run the competition. Ask an
              administrator to re-authorize it from the devices screen.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onRetry}>
              <RefreshCw /> Re-check access
            </Button>
            <Button
              render={<Link href={`/competitions/${competitionId}/devices`} />}
            >
              Manage devices
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DeviceStatusPill({ status }: { status: DeviceStatus | null }) {
  if (!status) return null;
  const config = {
    AUTHORIZED: {
      icon: ShieldCheck,
      className: "text-emerald-600 dark:text-emerald-400",
      label: "Device authorized",
    },
    PENDING:
      {
        icon: ShieldQuestion,
        className: "text-amber-600 dark:text-amber-400",
        label: "Device pending authorization",
      },
    REVOKED: {
      icon: ShieldAlert,
      className: "text-red-600 dark:text-red-400",
      label: "Device revoked",
    },
  }[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.className}`}
    >
      <Icon className="size-3.5" />
      {config.label}
    </span>
  );
}
