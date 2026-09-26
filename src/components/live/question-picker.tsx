"use client";

import { useMemo } from "react";
import { Check, Lock } from "lucide-react";
import type { EngineQuestion } from "@/features/engine/types";
import { cn } from "cn";

const DONE = new Set(["COMPLETED", "ANSWERED"]);
const ON_SCREEN = new Set([
  "SELECTED",
  "ANSWERING",
  "FAILED",
  "BONUS_AVAILABLE",
  "BONUS_ANSWERING",
]);

/**
 * Question picker board (spec §27). Grouped by point value, colored per tier,
 * with the point number shown prominently (never color alone). Only AVAILABLE
 * questions are selectable; completed questions are disabled.
 */
export function QuestionPicker({
  questions,
  currentTeamName,
  colorFor,
  disabled,
  onSelect,
}: {
  questions: EngineQuestion[];
  currentTeamName: string;
  colorFor: (points: number) => string;
  disabled: boolean;
  onSelect: (questionId: string) => void;
}) {
  const tiers = useMemo(() => {
    const byPoints = new Map<number, EngineQuestion[]>();
    for (const q of questions) {
      const arr = byPoints.get(q.points) ?? [];
      arr.push(q);
      byPoints.set(q.points, arr);
    }
    return Array.from(byPoints.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([points, qs]) => ({
        points,
        qs: qs.sort((a, b) => a.questionNumber - b.questionNumber),
      }));
  }, [questions]);

  const remaining = questions.filter((q) => !DONE.has(q.status)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Question board
        </p>
        <p className="text-sm text-muted-foreground">
          {currentTeamName} selects • {remaining} remaining
        </p>
      </div>

      {tiers.map((tier) => (
        <div key={tier.points} className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {tier.qs.map((q) => {
              const done = DONE.has(q.status);
              const onScreen = ON_SCREEN.has(q.status);
              const selectable = !disabled && !done && !onScreen;
              return (
                <button
                  key={q.id}
                  type="button"
                  disabled={!selectable}
                  onClick={() => onSelect(q.id)}
                  className={cn(
                    "relative flex aspect-[4/3] flex-col items-center justify-center rounded-xl border-2 p-2 text-center transition-all",
                    "disabled:cursor-not-allowed",
                    selectable && "hover:scale-[1.03] hover:shadow-md",
                    done && "opacity-40",
                    onScreen && "ring-2 ring-offset-2"
                  )}
                  style={{
                    borderColor: colorFor(q.points),
                    backgroundColor: done ? undefined : `${colorFor(q.points)}1a`,
                  }}
                >
                  <span
                    className="text-xl font-black tabular-nums"
                    style={{ color: colorFor(q.points) }}
                  >
                    {q.points.toLocaleString()}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    Q{q.questionNumber}
                  </span>
                  {done && (
                    <Check className="absolute right-1 top-1 size-4 text-emerald-600" />
                  )}
                  {onScreen && (
                    <Lock className="absolute right-1 top-1 size-3.5 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
