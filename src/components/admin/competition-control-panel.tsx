"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Lock, SlidersHorizontal } from "lucide-react";
import { emergencyLockAction } from "@/features/admin/actions";
import type { Team } from "@/types/database";
import { ScoreAdjustDialog } from "@/components/admin/score-adjust-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Prominent admin control panel (spec §101). Lifecycle transitions and the
 * ordinary lock live in StatusControls; this adds the score adjustment,
 * Super-Admin emergency lock (§102) and the audit-log entry point.
 */
export function CompetitionControlPanel({
  competitionId,
  teams,
  isSuperAdmin,
}: {
  competitionId: string;
  teams: Team[];
  isSuperAdmin: boolean;
}) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle>Competition control</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setAdjustOpen(true)}>
          <SlidersHorizontal />
          Adjust score
        </Button>
        <Button variant="outline" render={<Link href={`/competitions/${competitionId}/audit`} />}>
          <ClipboardList />
          Audit log
        </Button>
        {isSuperAdmin && (
          <Button variant="destructive" onClick={() => setLockOpen(true)}>
            <Lock />
            Emergency lock
          </Button>
        )}
      </CardContent>

      <ScoreAdjustDialog
        competitionId={competitionId}
        teams={teams}
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
      />
      <EmergencyLockDialog
        competitionId={competitionId}
        open={lockOpen}
        onOpenChange={setLockOpen}
      />
    </Card>
  );
}

function EmergencyLockDialog({
  competitionId,
  open,
  onOpenChange,
}: {
  competitionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (reason.trim().length < 3) {
      toast.error("A reason is required");
      return;
    }
    start(async () => {
      const res = await emergencyLockAction({
        competitionId,
        reason: reason.trim(),
      });
      if (res.ok) {
        toast.success("Competition locked");
        onOpenChange(false);
        setReason("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600 dark:text-red-400">
            Are you sure?
          </DialogTitle>
          <DialogDescription>
            This will prevent the connected competition device from continuing
            once the command is received.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lock-reason">Reason</Label>
            <Textarea
              id="lock-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for emergency lock…"
              rows={3}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              <Lock />
              Lock competition
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
