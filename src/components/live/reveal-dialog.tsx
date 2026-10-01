"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  HelpCircle,
  SkipForward,
  Trophy,
  XCircle,
} from "lucide-react";
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

/** Result kind driving the overlay: green correct, red wrong, orange skipped. */
type RevealOutcome = "correct" | "wrong" | "skipped" | "unknown";

const OUTCOMES: Record<RevealOutcome, string> = {
  correct: "#22c55e", // green — always, whichever team answered it
  wrong: "#ef4444", // red
  skipped: "#f97316", // orange — time ran out, correct answer revealed
  unknown: "#f59e0b", // amber — finalised without a recorded result
};

const TITLES: Record<RevealOutcome, string> = {
  correct: "Correct answer",
  wrong: "Wrong answer",
  skipped: "Time's up — correct answer",
  unknown: "No points awarded",
};

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
      className="text-4xl font-black leading-none tabular-nums sm:text-5xl md:text-6xl"
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
  teamName,
  onContinue,
}: {
  reveal: RevealInfo | null;
  /** Team that earned points (name only) — accents come from the outcome. */
  teamName: string | null;
  onContinue: () => void;
}) {
  const spring = useSpring();
  return (
    <Dialog open={reveal !== null}>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100vw-1.5rem)] max-h-[calc(100vh-1.5rem)] max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain sm:max-w-xl"
      >
        {reveal && (
          <RevealBody
            // Remount per reveal so every entrance animation replays fresh.
            key={`${reveal.question.id}|${reveal.awardedTeamId}|${reveal.awardedPoints}`}
            reveal={reveal}
            teamName={teamName}
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
  teamName,
  onContinue,
  spring,
}: {
  reveal: RevealInfo;
  /** Name of the team that earned points, when any. */
  teamName: string | null;
  onContinue: () => void;
  spring: object;
}) {
  const outcome: RevealOutcome =
    reveal.primaryResult === "CORRECT" || reveal.awardedPoints > 0
      ? "correct"
      : reveal.primaryResult === "TIMEOUT"
        ? "skipped"
        : reveal.primaryResult === "WRONG"
          ? "wrong"
          : "unknown";
  // The answer's outcome — not the team — drives every accent in this overlay.
  const accent = OUTCOMES[outcome];
  const scored = outcome === "correct" && teamName !== null;
  const Icon =
    outcome === "correct"
      ? Trophy
      : outcome === "wrong"
        ? XCircle
        : outcome === "skipped"
          ? SkipForward
          : HelpCircle;

  return (
    <div
      className="-m-4 flex flex-col gap-5 p-5 sm:p-6"
      style={{
        backgroundImage: `radial-gradient(120% 90% at 50% -10%, ${accent}26, transparent 70%)`,
      }}
    >
      {/* Result medallion */}
      <div className="flex flex-col items-center gap-3 pt-1 text-center">
        <div className="relative">
          {scored && (
            <span
              aria-hidden
              className="absolute inset-0 animate-ping rounded-full opacity-60"
              style={{ backgroundColor: `${accent}59` }}
            />
          )}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={spring}
            className="relative flex size-16 items-center justify-center rounded-full text-white sm:size-20"
            style={{
              backgroundImage: `linear-gradient(135deg, ${accent}, ${accent}b8)`,
              boxShadow: `0 10px 34px -6px ${accent}99`,
            }}
          >
            <Icon className="size-7 sm:size-9" />
          </motion.div>
        </div>
        <DialogHeader className="!gap-1.5">
          <DialogTitle
            className={cn(
              "text-center text-xl font-black tracking-tight sm:text-2xl md:text-3xl"
            )}
            style={{ color: accent }}
          >
            {TITLES[outcome]}
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
                borderColor: `${accent}66`,
                backgroundColor: `${accent}1f`,
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
                style={{ color: accent }}
              >
                {teamName}
              </span>
            </div>
            <div className="flex shrink-0 items-start gap-1">
              <span
                className="pt-1 text-2xl font-black"
                style={{ color: accent }}
              >
                +
              </span>
              <CountUp to={reveal.awardedPoints} color={accent} delay={0.3} />
            </div>
          </>
        ) : (
          <div className="flex w-full items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">
                The correct option is highlighted below
              </p>
              <p className="text-xs text-muted-foreground">
                {outcome === "skipped"
                  ? "Time ran out — nobody banked points on this one."
                  : "Nobody banked points on this one."}
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
                      backgroundImage: `linear-gradient(135deg, ${accent}, ${accent}c0)`,
                      boxShadow: `0 10px 28px -10px ${accent}99`,
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
          style={{ borderLeftColor: accent }}
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
          style={{
            backgroundColor: accent,
            color: "#fff",
            boxShadow: `0 10px 24px -10px ${accent}cc`,
          }}
          onClick={onContinue}
        >
          Continue
        </Button>
      </DialogFooter>
    </div>
  );
}
