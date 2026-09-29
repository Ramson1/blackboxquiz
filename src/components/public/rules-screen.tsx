"use client";

import { ArrowRight, Clock, ListChecks, Swords, Trophy, Zap } from "lucide-react";
import type { PublicRulesInfo } from "@/types/public";
import { Button } from "@/components/ui/button";

/**
 * Rules screen shown before a public run (plan §E1): the two teams, the board
 * size, the timer and the point tiers, ending in one big, always-visible
 * "Start the Competition" button — no checkbox gate, the button IS the
 * teams' confirmation.
 */
export function RulesScreen({
  competitionName,
  rules,
  onConfirm,
}: {
  competitionName: string;
  rules: PublicRulesInfo;
  onConfirm: () => void;
}) {
  const [teamOne, teamTwo] = rules.teamNames;
  const [colorOne, colorTwo] = rules.colors;

  const teams = [
    { name: teamOne, color: colorOne, label: "Team 1" },
    { name: teamTwo, color: colorTwo, label: "Team 2" },
  ];

  return (
    <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-6">
      {/* soft glow behind the header, echoing the home splash */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 left-1/2 -z-10 h-64 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
          The Rules
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-balance">
          {competitionName}
        </h1>
      </div>

      {/* Matchup card: both teams with a VS badge between them */}
      <div className="relative grid gap-3 sm:grid-cols-2 sm:gap-4">
        {teams.map((team) => (
          <div
            key={team.label}
            className="flex items-center gap-4 rounded-2xl border-2 p-5"
            style={{
              borderColor: team.color,
              backgroundColor: `${team.color}14`,
              boxShadow: `0 12px 28px -14px ${team.color}66`,
            }}
          >
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${team.color}26` }}
            >
              <Swords className="size-6" style={{ color: team.color }} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {team.label}
              </p>
              <p className="truncate text-xl font-black" style={{ color: team.color }}>
                {team.name}
              </p>
            </div>
          </div>
        ))}
        <span className="absolute left-1/2 top-1/2 z-10 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background bg-foreground text-sm font-black text-background shadow-lg sm:size-12">
          VS
        </span>
      </div>

      {/* Rules list */}
      <ul className="flex flex-col gap-3">
        <li className="flex items-start gap-4 rounded-2xl border bg-card p-4 text-sm shadow-sm">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <ListChecks className="size-4.5 text-primary" />
          </span>
          <span className="pt-1.5">
            Teams alternate picking questions from the board —{" "}
            <strong>{rules.questionCount}</strong> questions in total.
          </span>
        </li>
        <li className="flex items-start gap-4 rounded-2xl border bg-card p-4 text-sm shadow-sm">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Clock className="size-4.5 text-primary" />
          </span>
          <span className="pt-1.5">
            Each question has <strong>{rules.timePerQuestion} seconds</strong>{" "}
            on the timer. No answer in time scores nothing.
          </span>
        </li>
        <li className="flex items-start gap-4 rounded-2xl border bg-card p-4 text-sm shadow-sm">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Trophy className="size-4.5 text-primary" />
          </span>
          <span className="pt-1.5">
            Questions are worth{" "}
            <strong>{rules.pointTiers.join(" · ")}</strong> points. A wrong
            answer scores nothing — no negative marks.
          </span>
        </li>
        <li className="flex items-start gap-4 rounded-2xl border bg-card p-4 text-sm shadow-sm">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="size-4.5 text-primary" />
          </span>
          <span className="pt-1.5">
            Highest score when the questions run out{" "}
            <strong>wins the competition</strong>. Have fun!
          </span>
        </li>
      </ul>

      {/* Confirmation is the button itself — no checkbox to fumble with */}
      <div className="flex flex-col items-center gap-3 pt-1">
        <p className="text-center text-sm font-medium text-muted-foreground">
          Both teams have read the rules?
        </p>
        <Button
          size="lg"
          onClick={onConfirm}
          className="group h-12 w-full gap-2 rounded-full bg-gradient-to-r from-primary via-sky-500 to-primary bg-[length:200%_100%] px-10 text-base font-bold uppercase tracking-wider shadow-lg shadow-primary/40 transition-all duration-300 hover:bg-[position:100%_0] hover:shadow-primary/60 sm:w-auto"
        >
          Start the Competition
          <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
        </Button>
      </div>
    </div>
  );
}
