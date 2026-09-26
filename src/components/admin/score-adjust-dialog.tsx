"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { adjustScoreAction } from "@/features/admin/actions";
import type { Team } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Manual score adjustment (spec §56). A manager picks a team, a signed amount
 * and a mandatory reason; the confirmation shows previous → new before commit.
 */
export function ScoreAdjustDialog({
  competitionId,
  teams,
  open,
  onOpenChange,
}: {
  competitionId: string;
  teams: Team[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const team = teams.find((t) => t.id === teamId);
  const delta = Number(amount);
  const validDelta = Number.isInteger(delta) && delta !== 0;
  const newScore = team && validDelta ? team.current_score + delta : null;
  const wouldGoNegative = newScore != null && newScore < 0;

  function setSign(sign: 1 | -1) {
    const base = Number(amount) || 0;
    setAmount(String(sign * Math.abs(base || 100)));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!team || !validDelta || wouldGoNegative || reason.trim().length < 3) {
      toast.error("Check the amount and reason");
      return;
    }
    start(async () => {
      const res = await adjustScoreAction({
        competitionId,
        teamId: team.id,
        adjustment: delta,
        reason: reason.trim(),
      });
      if (res.ok) {
        toast.success(
          `${team.name}: ${res.result.previousScore.toLocaleString()} → ${res.result.newScore.toLocaleString()}`
        );
        onOpenChange(false);
        setAmount("");
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
          <DialogTitle>Score adjustment</DialogTitle>
          <DialogDescription>
            Record an audited correction. Every adjustment requires a reason.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-team">Team</Label>
            <select
              id="adj-team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.current_score.toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-amount">Adjustment</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Decrease"
                onClick={() => setSign(-1)}
              >
                <Minus />
              </Button>
              <Input
                id="adj-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 100 or -100"
                className="text-center tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Increase"
                onClick={() => setSign(1)}
              >
                <Plus />
              </Button>
            </div>
          </div>

          {team && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Previous</span>
                <span className="font-semibold tabular-nums">
                  {team.current_score.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Adjustment</span>
                <span
                  className={`font-semibold tabular-nums ${
                    validDelta && delta > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : validDelta
                        ? "text-red-600 dark:text-red-400"
                        : ""
                  }`}
                >
                  {validDelta ? `${delta > 0 ? "+" : ""}${delta.toLocaleString()}` : "—"}
                </span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-1">
                <span className="font-medium">New</span>
                <span
                  className={`font-bold tabular-nums ${
                    wouldGoNegative ? "text-red-600 dark:text-red-400" : ""
                  }`}
                >
                  {newScore != null ? newScore.toLocaleString() : "—"}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-reason">Reason</Label>
            <Textarea
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Judge correction…"
              rows={2}
              maxLength={500}
            />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              variant="default"
              disabled={
                pending || !team || !validDelta || wouldGoNegative || reason.trim().length < 3
              }
            >
              Confirm adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
