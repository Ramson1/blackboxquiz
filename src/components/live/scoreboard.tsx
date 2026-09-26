"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import type { LiveStatus } from "@/features/engine/types";
import { cn } from "cn";

/** Online/offline indicator (spec §40). Never gates the competition. */
export function ConnectionBadge() {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        online
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
      )}
      title={
        online
          ? "Connected — events sync automatically"
          : "Offline — competition actions are saved locally"
      }
    >
      {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
      {online ? "ONLINE" : "OFFLINE — SAFE"}
    </span>
  );
}

const STATUS_LABEL: Record<LiveStatus, string> = {
  IDLE: "Not started",
  LIVE: "Live",
  PAUSED: "Paused",
  COMPLETED: "Completed",
};

/**
 * Persistent scoreboard (spec §28). Backed entirely by local engine state so it
 * updates immediately and does not depend on a realtime connection.
 */
export function Scoreboard({
  competitionName,
  teams,
  currentTeamId,
  status,
  locked,
}: {
  competitionName: string;
  teams: { id: string; name: string; shortName: string | null; color: string; currentScore: number }[];
  currentTeamId: string;
  status: LiveStatus;
  locked: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-lg font-bold tracking-tight">
          {competitionName}
        </h2>
        <div className="flex items-center gap-2">
          <ConnectionBadge />
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              status === "LIVE"
                ? "bg-emerald-500 text-white"
                : status === "PAUSED"
                  ? "bg-amber-500 text-white"
                  : "bg-muted text-foreground"
            )}
          >
            {locked ? "LOCKED" : STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {teams.map((t) => {
          const active = t.id === currentTeamId;
          return (
            <div
              key={t.id}
              className={cn(
                "relative overflow-hidden rounded-xl border-2 bg-card p-4 transition-all",
                active ? "shadow-lg" : "opacity-90"
              )}
              style={{ borderColor: t.color }}
            >
              <div
                className="absolute inset-y-0 left-0 w-1.5"
                style={{ backgroundColor: t.color }}
              />
              <div className="flex flex-col gap-1 pl-2">
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold">{t.name}</span>
                  {active && (
                    <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                      Their turn
                    </span>
                  )}
                </div>
                <span
                  className="text-4xl font-black tabular-nums"
                  style={{ color: t.color }}
                >
                  {t.currentScore.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
