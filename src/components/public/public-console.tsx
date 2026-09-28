"use client";

import Link from "next/link";
import type { EngineEvent } from "@/features/engine/types";
import type { DownloadablePackage } from "@/features/offline/package-types";
import { usePublicRun } from "@/features/public/use-public-run";
import {
  checkCompleteness,
  toContentMap,
  toPointColors,
} from "@/lib/offline/store";
import { Button } from "@/components/ui/button";
import { LiveConsoleView } from "@/components/live/live-console";

/**
 * The public question board (plan §E3): the shared operator console driven by
 * the public engine (sessionStorage snapshot + batched event flushes). Bonus
 * rounds are off, and the exit/results links go home — a public host has no
 * admin workspace to return to.
 */
export function PublicConsole({
  pkg,
  password,
  events,
}: {
  pkg: DownloadablePackage;
  password: string;
  events: EngineEvent[];
}) {
  const engine = usePublicRun(pkg, password, events);
  const completeness = checkCompleteness(pkg);

  if (!completeness.ok || !engine) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <h2 className="text-lg font-bold">This competition isn&apos;t ready</h2>
        <p className="text-sm text-muted-foreground">
          {completeness.issues[0] ??
            "The competition data is incomplete — check your setup questions and teams."}
        </p>
        <Button variant="outline" render={<Link href="/" />}>
          Back to home
        </Button>
      </div>
    );
  }

  return (
    <LiveConsoleView
      engine={engine}
      competitionId={pkg.competition.id}
      competitionName={pkg.competition.name}
      contentMap={toContentMap(pkg)}
      pointColors={toPointColors(pkg)}
      allowBonus={false}
      exitHref="/"
      hideResults
    />
  );
}
