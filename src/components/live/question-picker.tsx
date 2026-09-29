"use client";

import { useMemo } from "react";
import { Check, Lock, MousePointerClick } from "lucide-react";
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

type TeamInfo = { name: string; color: string };

/**
 * Question picker board (spec §27). Grouped by point value, colored per tier,
 * with the point number shown prominently (never color alone). Only AVAILABLE
 * questions are selectable; completed questions are disabled. The board opens
 * with an unmistakable full-width turn banner in the choosing team's color.
 */
export function QuestionPicker({
  questions,
  currentTeam,
  otherTeam,
  colorFor,
  disabled,
  onSelect,
}: {
  questions: EngineQuestion[];
  currentTeam: TeamInfo;
  otherTeam: TeamInfo | null;
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
      {/* Turn banner: the choosing team owns the board right now */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-white sm:p-6"
        style={{
          backgroundImage: `linear-gradient(135deg, ${currentTeam.color}, ${currentTeam.color}c4)`,
          boxShadow: `0 18px 44px -18px ${currentTeam.color}99`,
        }}
      >
        <MousePointerClick
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-4 size-32 rotate-12 opacity-15"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-2 ring-white/40">
              <MousePointerClick className="size-7" />
            </span>
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-white/80">
                <span className="size-2 animate-ping rounded-full bg-white" />
                Your turn to pick
              </p>
              <p className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                {currentTeam.name}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <span className="rounded-full bg-white/20 px-3.5 py-1.5 text-sm font-black ring-1 ring-white/40">
              {remaining} left
            </span>
            {otherTeam && (
              <span className="text-xs font-medium text-white/75">
                then {otherTeam.name}&apos;s turn
              </span>
            )}
          </div>
        </div>
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
