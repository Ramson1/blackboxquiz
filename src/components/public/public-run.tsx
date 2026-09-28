"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { publicGetBundleAction } from "@/features/public/actions";
import {
  hasPublicRunSnapshot,
} from "@/features/public/use-public-run";
import {
  loadRunCredential,
  saveRunCredential,
  PUBLIC_STATE_KEY,
  type PublicRunCredential,
} from "@/features/public/run-storage";
import { RulesScreen } from "@/components/public/rules-screen";
import { TeamReveal } from "@/components/public/team-reveal";
import { PublicConsole } from "@/components/public/public-console";

/**
 * Public run screen (plan §E): three local steps — rules → team splash →
 * question board — with no extra routes. Authorization is re-verified
 * silently with the title + password from sessionStorage on every entry, so
 * a refresh resumes against the server's latest event log; a mid-run
 * snapshot short-circuits straight to the board.
 */
export function PublicRunScreen({ id }: { id: string }) {
  const router = useRouter();
  const [cred, setCred] = useState<PublicRunCredential | null>(null);
  const [step, setStep] = useState<"rules" | "teams" | "board">("rules");

  useEffect(() => {
    // Async IIFE keeps the client-only restore out of the effect body
    // (hydration-safe, and no cascading synchronous renders).
    void (async () => {
      const stored = loadRunCredential();
      if (!stored) {
        router.replace("/");
        return;
      }
      if (stored.bundle.bundle.competition.id !== id) {
        router.replace(`/run/${stored.bundle.bundle.competition.id}`);
        return;
      }
      setCred(stored);
      // Resume mid-run? The snapshot carries the exact board state.
      if (hasPublicRunSnapshot(id)) {
        try {
          const raw = sessionStorage.getItem(PUBLIC_STATE_KEY);
          const status = raw
            ? ((JSON.parse(raw)?.state?.status ?? "IDLE") as string)
            : "IDLE";
          if (status !== "IDLE") setStep("board");
        } catch {
          /* fall through to the rules screen */
        }
      }
      // Silent re-verify + refresh (also re-drives READY → LIVE idempotently).
      const res = await publicGetBundleAction({
        title: stored.title,
        password: stored.password,
      });
      if (res.ok) {
        const fresh = { ...stored, bundle: res.bundle };
        saveRunCredential(fresh);
        setCred(fresh);
      }
      // On failure we keep the cached bundle: the snapshot still drives the
      // board, and the flush RPC will surface real auth errors later.
    })();
  }, [id, router]);

  if (!cred) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading your competition…
      </div>
    );
  }

  const { bundle, events, rules } = cred.bundle;

  if (step === "rules") {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <RulesScreen
          competitionName={bundle.competition.name}
          rules={rules}
          onConfirm={() => setStep("teams")}
        />
      </div>
    );
  }

  if (step === "teams") {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <TeamReveal
          teamOne={rules.teamNames[0] ?? "Team 1"}
          teamTwo={rules.teamNames[1] ?? "Team 2"}
          colorOne={rules.colors[0] ?? "#2563EB"}
          colorTwo={rules.colors[1] ?? "#DC2626"}
          onStart={() => setStep("board")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6">
      <PublicConsole pkg={bundle} password={cred.password} events={events} />
    </div>
  );
}
