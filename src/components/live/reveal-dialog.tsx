"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, HelpCircle, Trophy, XCircle } from "lucide-react";
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

type Team = { name: string; color: string } | null;

/** Spring entrance for the overlay content; instantly settled for reduced motion. */
const SPRING = { type: "spring", bounce: 0.3, duration: 0.55 } as const;

function useSpring() {
  const reduce = useReducedMotion();
  return reduce ? { duration: 0 } : SPRING;
}

/** Count up in the winning team's color (same pattern as the victory screen). */
function CountUp({
  to,
  color,
  delay,
}: {
  to: number;
  color: string;
  delay: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const lastRound = useRef(-1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Skip the animation under reduced motion — settle on the final value.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = to.toLocaleString();
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / 1100);
      const eased = 1 - Math.pow(1 - t, 3);
      const r = Math.round(to * eased);
      if (r !== lastRound.current) {
        lastRound.current = r;
        el.textContent = r.toLocaleString();
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delay * 1000);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [to, delay]);

  return (
    <span
      ref={ref}
      className="text-5xl font-black leading-none tabular-nums sm:text-6xl"
      style={{ color }}
    >
      0
    </span>
  );
}

/**
 * Answer reveal shown to the audience after a question is finalized (§24).
 * Celebration layout: glowing result medallion, points counting up in the
 * scoring team's color, and the correct option unmistakably highlighted.
 */
export function RevealDialog({
  reveal,
  team,
  onContinue,
}: {
  reveal: RevealInfo | null;
  /** Winning team (name + color) when points were awarded; null otherwise. */
  team: Team;
  onContinue: () => void;
}) {
  const spring = useSpring();
  return (
    <Dialog open={reveal !== null}>
      <DialogContent showCloseButton={false} className="sm:max-w-xl">
        {reveal && (
          <RevealBody
            // Remount per reveal so every entrance animation replays fresh.
            key={`${reveal.question.id}|${reveal.awardedTeamId}|${reveal.awardedPoints}`}
            reveal={reveal}
            team={team}
            onContinue={onContinue}
            spring={spring}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevealBody({
  reveal,
  team,
  onContinue,
  spring,
}: {
  reveal: RevealInfo;
  team: Team;
  onContinue: () => void;
  spring: object;
}) {
  const scored = reveal.awardedPoints > 0 && team !== null;
  const tint = scored ? team.color : "#f59e0b";
  const Icon = scored ? Trophy : reveal.primaryResult ? XCircle : HelpCircle;

  return (
    <div
      className="-m-4 flex flex-col gap-5 p-5 sm:p-6"
      style={{
        backgroundImage: `radial-gradient(120% 90% at 50% -10%, ${tint}26, transparent 70%)`,
      }}
    >
      {/* Result medallion */}
      <div className="flex flex-col items-center gap-3 pt-1 text-center">
        <div className="relative">
          {scored && (
            <span
              aria-hidden
              className="absolute inset-0 animate-ping rounded-full opacity-60"
              style={{ backgroundColor: `${tint}59` }}
            />
          )}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={spring}
            className="relative flex size-20 items-center justify-center rounded-full text-white"
            style={{
              backgroundImage: `linear-gradient(135deg, ${tint}, ${tint}b8)`,
              boxShadow: `0 10px 34px -6px ${tint}99`,
            }}
          >
            <Icon className="size-9" />
          </motion.div>
        </div>
        <DialogHeader className="!gap-1.5">
          <DialogTitle
            className={cn(
              "text-center text-2xl font-black tracking-tight sm:text-3xl"
            )}
            style={scored ? { color: team.color } : undefined}
          >
            {scored ? "Correct answer" : "No points awarded"}
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            {reveal.question.text}
          </DialogDescription>
        </DialogHeader>
      </div>

      {/* Points band */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...spring, delay: 0.15 }}
        className={cn(
          "flex items-center justify-between gap-4 rounded-2xl border-2 px-5 py-4",
          !scored && "bg-muted/50"
        )}
        style={
          scored
            ? {
                borderColor: `${team.color}66`,
                backgroundColor: `${team.color}1f`,
              }
            : undefined
        }
      >
        {scored ? (
          <>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                Points to
              </span>
              <span
                className="truncate text-lg font-black"
                style={{ color: team.color }}
              >
                {team.name}
              </span>
            </div>
            <div className="flex shrink-0 items-start gap-1">
              <span
                className="pt-1 text-2xl font-black"
                style={{ color: team.color }}
              >
                +
              </span>
              <CountUp to={reveal.awardedPoints} color={team.color} delay={0.3} />
            </div>
          </>
        ) : (
          <div className="flex w-full items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">The correct option is highlighted below</p>
              <p className="text-xs text-muted-foreground">
                Nobody banked points on this one.
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Options — the right answer unmistakable, the rest faded back */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
        className="flex flex-col gap-2"
      >
        {reveal.question.options.map((o) => {
          const correct = o.id === reveal.question.correctOptionId;
          return (
            <motion.div
              key={o.id}
              variants={{
                hidden: { opacity: 0, x: -12 },
                show: { opacity: 1, x: 0, transition: spring },
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 transition-colors",
                correct
                  ? "text-white"
                  : "border bg-card/60 text-muted-foreground opacity-70"
              )}
              style={
                correct
                  ? {
                      backgroundImage: `linear-gradient(135deg, ${tint}, ${tint}c0)`,
                      boxShadow: `0 10px 28px -10px ${tint}99`,
                    }
                  : undefined
              }
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-black",
                  correct
                    ? "bg-white/20 ring-2 ring-white/50"
                    : "border text-xs font-bold"
                )}
              >
                {o.key}
              </span>
              <span
                className={cn(
                  "flex-1",
                  correct ? "text-base font-bold" : "text-sm font-medium"
                )}
              >
                {o.text}
              </span>
              {correct ? (
                <CheckCircle2 className="size-6 shrink-0" />
              ) : (
                <XCircle className="size-4 shrink-0 opacity-30" />
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {reveal.question.explanation && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...spring, delay: 0.4 }}
          className="flex gap-3 rounded-xl border-l-4 bg-muted/60 px-4 py-3 text-sm leading-relaxed"
          style={{ borderLeftColor: tint }}
        >
          <div>
            <span className="font-bold uppercase tracking-widest text-muted-foreground text-[11px]">
              Explanation
            </span>
            <p className="mt-0.5">{reveal.question.explanation}</p>
          </div>
        </motion.div>
      )}

      <DialogFooter>
        <Button
          size="lg"
          className="w-full sm:w-auto"
          style={
            scored
              ? {
                  backgroundColor: team.color,
                  color: "#fff",
                  boxShadow: `0 10px 24px -10px ${team.color}cc`,
                }
              : undefined
          }
          onClick={onContinue}
        >
          Continue
        </Button>
      </DialogFooter>
    </div>
  );
}
