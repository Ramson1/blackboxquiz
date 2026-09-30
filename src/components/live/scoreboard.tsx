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

      {/* On-turn team dominates the board; the off-turn team stays visible but small and desaturated. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        {teams.map((t) => {
          const active = t.id === currentTeamId;
          const live = status === "LIVE" || status === "PAUSED";
          if (!active) {
            return (
              <div
                key={t.id}
                className="order-2 flex min-w-0 flex-col justify-center gap-1 rounded-xl border bg-muted/40 p-3 opacity-70 grayscale transition-all duration-300 lg:w-52"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t.name}
                  </span>
                </div>
                <span className="pl-[18px] text-2xl font-bold tabular-nums text-muted-foreground">
                  {t.currentScore.toLocaleString()}
                </span>
              </div>
            );
          }
          return (
            <div
              key={t.id}
              className="relative order-1 min-w-0 flex-1 overflow-hidden rounded-2xl border-2"
              style={{
                borderColor: t.color,
                boxShadow: `0 20px 56px -16px ${t.color}b3`,
              }}
            >
              {/* Solid color header: the projector-legible ON TURN bar (only while on air) */}
              <div
                className="relative flex items-center justify-between gap-3 px-5 py-3.5 text-white"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${t.color}, ${t.color}c9)`,
                }}
              >
                {live ? (
                  <span className="flex animate-pulse items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-sm font-black uppercase tracking-[0.2em] ring-1 ring-white/40">
                    <span className="size-2 rounded-full bg-white" />
                    On turn
                  </span>
                ) : (
                  <span className="text-sm font-black uppercase tracking-[0.2em] text-white/80">
                    {status === "COMPLETED" ? "Final" : "Current"}
                  </span>
                )}
                <span className="truncate text-lg font-black uppercase tracking-tight sm:text-xl">
                  {t.name}
                </span>
              </div>
              {/* Tinted body with the oversized live score */}
              <div
                className="flex items-end justify-between gap-4 px-5 py-4"
                style={{ backgroundColor: `${t.color}1f` }}
              >
                <span
                  className="text-6xl font-black leading-none tabular-nums sm:text-7xl"
                  style={{ color: t.color }}
                >
                  {t.currentScore.toLocaleString()}
                </span>
                <span className="pb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  points
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
