"use client";

import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Team splash (plan §E2): the big reveal of the two competing teams before
 * the board opens — projector-friendly, one action to continue.
 */
export function TeamReveal({
  teamOne,
  teamTwo,
  colorOne,
  colorTwo,
  onStart,
}: {
  teamOne: string;
  teamTwo: string;
  colorOne: string;
  colorTwo: string;
  onStart: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-8 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        The competitors
      </p>
      <div className="grid w-full items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <div
          className="rounded-2xl border-2 bg-card px-6 py-10 shadow-lg"
          style={{ borderColor: colorOne, boxShadow: `0 0 40px ${colorOne}22` }}
        >
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Team 1
          </p>
          <p
            className="mt-2 text-3xl font-black break-words sm:text-4xl"
            style={{ color: colorOne }}
          >
            {teamOne}
          </p>
        </div>
        <span className="text-3xl font-black text-muted-foreground">VS</span>
        <div
          className="rounded-2xl border-2 bg-card px-6 py-10 shadow-lg"
          style={{ borderColor: colorTwo, boxShadow: `0 0 40px ${colorTwo}22` }}
        >
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Team 2
          </p>
          <p
            className="mt-2 text-3xl font-black break-words sm:text-4xl"
            style={{ color: colorTwo }}
          >
            {teamTwo}
          </p>
        </div>
      </div>
      <Button
        size="lg"
        className="gap-2 rounded-full px-10 shadow-lg shadow-primary/30"
        onClick={onStart}
      >
        <Rocket />
        Start the competition
      </Button>
    </div>
  );
}
