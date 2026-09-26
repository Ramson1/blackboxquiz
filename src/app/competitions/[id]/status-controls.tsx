"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import {
  setCompetitionLockAction,
  setCompetitionStatusAction,
} from "@/features/competitions/actions";
import { nextStatuses, statusLabel } from "@/features/competitions/lifecycle";
import type { CompetitionStatus } from "@/lib/permissions/roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatusControls({
  competitionId,
  status,
  locked,
}: {
  competitionId: string;
  status: CompetitionStatus;
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const available = nextStatuses(status);

  function changeStatus(next: CompetitionStatus) {
    start(async () => {
      const res = await setCompetitionStatusAction({ competitionId, status: next });
      if (res.ok) {
        toast.success(`Status changed to ${statusLabel(next)}`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function toggleLock() {
    start(async () => {
      const res = await setCompetitionLockAction({
        competitionId,
        locked: !locked,
      });
      if (res.ok) {
        toast.success(locked ? "Competition unlocked" : "Competition locked");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Lifecycle controls</CardTitle>
        <Button
          variant={locked ? "outline" : "destructive"}
          size="sm"
          disabled={pending}
          onClick={toggleLock}
        >
          {locked ? <Unlock /> : <Lock />}
          {locked ? "Unlock" : "Lock competition"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {available.length === 0 && !locked && (
          <p className="text-sm text-muted-foreground">
            No further transitions available from {statusLabel(status)}.
          </p>
        )}
        {available.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === "LIVE" ? "default" : "outline"}
            disabled={pending || (locked && s === "LIVE")}
            onClick={() => changeStatus(s)}
            title={locked && s === "LIVE" ? "Unlock the competition first" : undefined}
          >
            Move to {statusLabel(s)}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
