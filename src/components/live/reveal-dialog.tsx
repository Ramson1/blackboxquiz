"use client";

import { Check, Trophy, X } from "lucide-react";
import type { RevealInfo } from "@/features/live/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "cn";

/** Answer reveal shown to the audience after a question is finalized (§24). */
export function RevealDialog({
  reveal,
  teamName,
  onContinue,
}: {
  reveal: RevealInfo | null;
  teamName: (teamId: string | null) => string;
  onContinue: () => void;
}) {
  const scored = reveal ? reveal.awardedPoints > 0 : false;
  return (
    <Dialog open={reveal !== null}>
      <DialogContent showCloseButton={false} className="sm:max-w-xl">
        {reveal && (
          <>
            <DialogHeader>
              <DialogTitle className="text-center text-2xl">
                Correct answer
              </DialogTitle>
              <DialogDescription className="text-center">
                {reveal.question.text}
              </DialogDescription>
            </DialogHeader>

            <div
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-lg font-bold",
                scored
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {scored ? (
                <>
                  <Trophy className="size-5" />
                  {teamName(reveal.awardedTeamId)} +
                  {reveal.awardedPoints.toLocaleString()}
                </>
              ) : (
                <>No points awarded</>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {reveal.question.options.map((o) => {
                const correct = o.id === reveal.question.correctOptionId;
                return (
                  <div
                    key={o.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                      correct && "border-primary bg-primary/10 font-semibold"
                    )}
                  >
                    <span className="flex size-6 items-center justify-center rounded-full border text-xs font-bold">
                      {o.key}
                    </span>
                    <span className="flex-1">{o.text}</span>
                    {correct ? (
                      <Check className="size-4 text-primary" />
                    ) : (
                      <X className="size-4 text-muted-foreground/40" />
                    )}
                  </div>
                );
              })}
            </div>

            {reveal.question.explanation && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <span className="font-medium">Explanation: </span>
                {reveal.question.explanation}
              </div>
            )}

            <DialogFooter>
              <Button className="w-full sm:w-auto" onClick={onContinue}>
                Continue
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
