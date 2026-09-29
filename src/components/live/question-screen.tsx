"use client";

import { useEffect, useRef } from "react";
import {
  Hand,
  Pause,
  SkipForward,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";
import type { ActivePhase } from "@/features/engine/types";
import type { LiveQuestionContent } from "@/features/live/types";
import { Timer } from "@/components/live/timer";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

type Team = { name: string; color: string };

/**
 * Question screen (spec §18–§24). The team whose turn it now is owns the
 * screen: a full-width banner in their color, then the question, options and
 * the timestamp-based timer. The countdown starts AUTOMATICALLY the moment
 * the question appears on screen — the operator no longer clicks "Start
 * timer". Answering correctness is decided by the parent comparing the chosen
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

  // Auto-start: the instant a question is on screen (and not paused), the
  // timer begins. Guarded per question so a re-render never double-fires;
  // the engine itself also rejects a start outside the SELECTED phase.
  const startedFor = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "SELECTED" || paused) return;
    if (startedFor.current === questionNumber) return;
    startedFor.current = questionNumber;
    onStart();
  }, [phase, paused, questionNumber, onStart]);

  const banner = {
    SELECTED: { kicker: "Question on screen — timer starting", icon: Hand },
    ANSWERING: { kicker: "Now answering", icon: Swords },
    BONUS_ANSWERING: { kicker: "Bonus round — their turn", icon: Sparkles },
    FAILED: { kicker: "Incorrect — bonus decision", icon: Pause },
  }[phase];
  const BannerIcon = banner.icon;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div className="flex flex-col gap-5">
        {/* Turn takeover: the team whose turn it is owns the screen */}
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl p-5 text-white sm:p-6",
            phase !== "FAILED" && "animate-in fade-in slide-in-from-top-2 duration-300"
          )}
          style={{
            backgroundImage: `linear-gradient(135deg, ${answerTeam.color}, ${answerTeam.color}c4)`,
            boxShadow: `0 18px 44px -18px ${answerTeam.color}99`,
          }}
        >
          {/* oversized watermark icon */}
          <BannerIcon
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-6 size-36 opacity-15"
          />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-2 ring-white/40">
                <BannerIcon className="size-7" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/80">
                  {banner.kicker}
                </p>
                <p className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                  {answerTeam.name}
                </p>
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-black text-white ring-1 ring-white/40"
              style={{ backgroundColor: color }}
            >
              <Trophy className="size-4" />
              {points.toLocaleString()} pts
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-muted-foreground">
            Question {questionNumber}
          </span>
          {content.category && (
            <span className="text-muted-foreground">· {content.category}</span>
          )}
          {phase === "BONUS_ANSWERING" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold uppercase text-amber-600">
              <Sparkles className="size-3" /> Bonus
            </span>
          )}
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
          <div className="flex size-28 flex-col items-center justify-center gap-1 rounded-full border-4 border-dashed text-center text-sm text-muted-foreground">
            {paused ? (
              "Paused"
            ) : phase === "SELECTED" ? (
              <>
                <Hand className="size-5 animate-pulse" />
                <span>Get set…</span>
              </>
            ) : (
              "—"
            )}
          </div>
        )}

        <div className="flex w-full flex-col gap-2">
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
