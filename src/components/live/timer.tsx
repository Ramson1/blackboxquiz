"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "cn";

/**
 * Timestamp-based countdown (spec §25/§26). Remaining time is always derived
 * from `expiresAt - Date.now()`, so the timer survives re-renders, remounts and
 * refreshes without drifting. When `running` flips false (e.g. pause) the tick
 * stops; on resume the parent supplies a shifted `expiresAt`. Fires `onExpire`
 * exactly once when the deadline passes.
 */
export function Timer({
  expiresAt,
  totalSeconds,
  running,
  onExpire,
}: {
  expiresAt: number;
  totalSeconds: number;
  running: boolean;
  onExpire: () => void;
}) {
  const cbRef = useRef(onExpire);
  const firedRef = useRef(false);

  useEffect(() => {
    cbRef.current = onExpire;
  }, [onExpire]);

  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
  );

  useEffect(() => {
    if (!running) return;
    firedRef.current = false;
    const tick = () => {
      const secs = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0 && !firedRef.current) {
        firedRef.current = true;
        cbRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [expiresAt, running]);

  const pct =
    totalSeconds > 0
      ? Math.max(0, Math.min(100, (remaining / totalSeconds) * 100))
      : 0;
  const urgent = remaining <= 5;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div
        className={cn(
          "flex size-28 items-center justify-center rounded-full border-4 text-4xl font-black tabular-nums transition-colors",
          urgent
            ? "animate-pulse border-red-500 text-red-500"
            : "border-primary/30 text-foreground"
        )}
      >
        {remaining}
      </div>
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-linear",
            urgent ? "bg-red-500" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {urgent ? "Hurry up" : "Seconds remaining"}
      </p>
    </div>
  );
}
