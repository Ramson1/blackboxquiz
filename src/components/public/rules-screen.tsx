"use client";

import { useState } from "react";
import { Check, Clock, ListChecks, Swords, Trophy } from "lucide-react";
import type { PublicRulesInfo } from "@/types/public";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * Rules screen shown before a public run (plan §E1): the two teams, the board
 * size, the timer and the point tiers, with an explicit student-facing
 * confirmation step before anything can be scored.
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
  const [agreed, setAgreed] = useState(false);
  const [teamOne, teamTwo] = rules.teamNames;
  const [colorOne, colorTwo] = rules.colors;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
          The Rules
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-balance">
          {competitionName}
        </h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className="flex items-center gap-3 rounded-xl border bg-card p-4"
          style={{ borderColor: colorOne }}
        >
          <Swords className="size-6 shrink-0" style={{ color: colorOne }} />
          <div>
            <p className="text-xs text-muted-foreground">Team 1</p>
            <p className="text-lg font-bold">{teamOne}</p>
          </div>
        </div>
        <div
          className="flex items-center gap-3 rounded-xl border bg-card p-4"
          style={{ borderColor: colorTwo }}
        >
          <Swords className="size-6 shrink-0" style={{ color: colorTwo }} />
          <div>
            <p className="text-xs text-muted-foreground">Team 2</p>
            <p className="text-lg font-bold">{teamTwo}</p>
          </div>
        </div>
      </div>

      <ul className="flex flex-col gap-3 rounded-xl border bg-card p-5 text-sm">
        <li className="flex items-start gap-3">
          <ListChecks className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Teams alternate picking questions from the board —{" "}
            <strong>{rules.questionCount}</strong> questions in total.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Each question has <strong>{rules.timePerQuestion} seconds</strong>{" "}
            on the timer. No answer in time scores nothing.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <Trophy className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Questions are worth{" "}
            <strong>{rules.pointTiers.join(" · ")}</strong> points. A wrong
            answer scores nothing — no negative marks.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-0.5 size-4 shrink-0 text-center leading-4">⚡</span>
          <span>
            Highest score when the questions run out{" "}
            <strong>wins the competition</strong>. Have fun!
          </span>
        </li>
      </ul>

      <label className="flex items-center justify-center gap-3 text-sm">
        <Checkbox
          id="rules-agree"
          checked={agreed}
          onCheckedChange={(v) => setAgreed(v === true)}
        />
        <Label htmlFor="rules-agree" className="cursor-pointer font-medium">
          Both teams understand the rules
        </Label>
      </label>

      <Button
        size="lg"
        className="mx-auto w-full gap-2 rounded-full sm:w-auto sm:px-10"
        disabled={!agreed}
        onClick={onConfirm}
      >
        <Check />
        We&apos;re ready
      </Button>
    </div>
  );
}
