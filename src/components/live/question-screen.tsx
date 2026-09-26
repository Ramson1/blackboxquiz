"use client";

import { Pause, Play, SkipForward, Sparkles, Trophy } from "lucide-react";
import type { ActivePhase } from "@/features/engine/types";
import type { LiveQuestionContent } from "@/features/live/types";
import { Timer } from "@/components/live/timer";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

type Team = { name: string; color: string };

/**
 * Question screen (spec §18–§24). Displays the question, options, active team,
 * point value and timestamp-based timer, and gives the operator phase-aware
 * controls. Answering correctness is decided by the parent comparing the chosen
 * option to the stored correct answer, so the operator never reveals it early.
 */
export function QuestionScreen({
  content,
  points,
  questionNumber,
  color,
  phase,
  primaryTeam,
  bonusTeam,
  timeLimit,
  expiresAt,
  paused,
  allowBonus,
  onStart,
  onAnswer,
  onTimeout,
  onOfferBonus,
  onRevealWithoutBonus,
}: {
  content: LiveQuestionContent;
  points: number;
  questionNumber: number;
  color: string;
  phase: ActivePhase;
  primaryTeam: Team;
  bonusTeam: Team | null;
  timeLimit: number;
  expiresAt: number | null;
  paused: boolean;
  allowBonus: boolean;
  onStart: () => void;
  onAnswer: (optionId: string) => void;
  onTimeout: () => void;
  onOfferBonus: () => void;
  onRevealWithoutBonus: () => void;
}) {
  const answering =
    (phase === "ANSWERING" || phase === "BONUS_ANSWERING") && !paused;
  const running =
    (phase === "ANSWERING" || phase === "BONUS_ANSWERING") &&
    !paused &&
    expiresAt != null;
  const answerTeam =
    phase === "BONUS_ANSWERING" ? bonusTeam ?? primaryTeam : primaryTeam;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div className="flex flex-col gap-5">
        {/* Who is on the question right now */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold text-white"
            style={{ backgroundColor: color }}
          >
            <Trophy className="size-3.5" />
            {points.toLocaleString()}
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            Question {questionNumber}
          </span>
          {content.category && (
            <span className="text-sm text-muted-foreground">
              · {content.category}
            </span>
          )}
          {phase === "BONUS_ANSWERING" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold uppercase text-amber-600">
              <Sparkles className="size-3" /> Bonus
            </span>
          )}
        </div>

        <div
          className="rounded-2xl border-l-4 bg-muted/40 p-4"
          style={{ borderColor: answerTeam.color }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {phase === "FAILED" ? "Attempt" : "Answering"}
          </p>
          <p className="text-lg font-bold" style={{ color: answerTeam.color }}>
            {answerTeam.name}
          </p>
        </div>

        <p className="text-2xl font-semibold leading-snug">{content.text}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          {content.options.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={!answering}
              onClick={() => onAnswer(o.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 bg-card p-4 text-left transition-all",
                answering
                  ? "hover:border-primary hover:shadow-md"
                  : "cursor-not-allowed opacity-80"
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted font-black">
                {o.key}
              </span>
              <span className="text-base font-medium">{o.text}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Timer + operator controls */}
      <div className="flex flex-col items-center gap-5 rounded-2xl border bg-card p-5">
        {running && expiresAt ? (
          <Timer
            expiresAt={expiresAt}
            totalSeconds={timeLimit}
            running={running}
            onExpire={onTimeout}
          />
        ) : (
          <div className="flex size-28 items-center justify-center rounded-full border-4 border-dashed text-sm text-muted-foreground">
            {paused ? "Paused" : phase === "SELECTED" ? "Ready" : "—"}
          </div>
        )}

        <div className="flex w-full flex-col gap-2">
          {phase === "SELECTED" && (
            <Button className="w-full" onClick={onStart} disabled={paused}>
              <Play /> Start timer
            </Button>
          )}
          {answering && (
            <>
              <p className="text-center text-xs text-muted-foreground">
                Tap the option {answerTeam.name} chose
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={onTimeout}
              >
                <SkipForward /> No answer / timeout
              </Button>
            </>
          )}
          {phase === "FAILED" && (
            <>
              <p className="text-center text-sm font-semibold text-red-600">
                {primaryTeam.name} was incorrect
              </p>
              {allowBonus && bonusTeam && (
                <Button className="w-full" onClick={onOfferBonus}>
                  <Sparkles /> Bonus: {bonusTeam.name}
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={onRevealWithoutBonus}
              >
                Reveal answer
              </Button>
            </>
          )}
          {paused && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Pause className="size-3.5" /> Competition paused
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
