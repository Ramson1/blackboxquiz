"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { syncLiveEventAction } from "@/features/live/actions";
import {
  countConflicts,
  countPending,
  getPendingEvents,
  markEventConflict,
  markEventsSynced,
} from "@/lib/offline/store";

/** §37 exponential backoff ladder (ms). Retries continue while the show runs. */
const BACKOFF = [2000, 5000, 10000, 30000, 60000, 300000];

export interface OfflineSync {
  online: boolean;
  syncing: boolean;
  pending: number;
  conflicts: number;
  lastSyncedAt: number | null;
  /** Trigger a drain now (e.g. right after new events are written locally). */
  syncNow: () => void;
}

/**
 * Drains the IndexedDB sync queue to the server (spec §36–§41). Sends unsynced
 * events in sequence order, marks them synced, stops cleanly when offline, and
 * retries transient failures with exponential backoff. Conflicts are flagged
 * locally and skipped (they need an admin, never silently discarded). Never
 * deletes unsynchronized events.
 */
export function useOfflineSync(competitionId: string): OfflineSync {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const runningRef = useRef(false);
  const failStreakRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the latest drain() so the scheduled retry never references itself
  // before declaration (React Compiler immutability rule).
  const drainRef = useRef<() => void>(() => {});

  const refreshCounts = useCallback(async () => {
    setPending(await countPending(competitionId));
    setConflicts(await countConflicts(competitionId));
  }, [competitionId]);

  const drain = useCallback(async () => {
    if (runningRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOnline(false);
      return;
    }
    runningRef.current = true;
    setSyncing(true);
    let synced = 0;
    try {
      const events = await getPendingEvents(competitionId);
      for (const e of events) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setOnline(false);
          break;
        }
        const res = await syncLiveEventAction(e);
        if (res.status === "SYNCED") {
          await markEventsSynced([e.event_id]);
          synced += 1;
          failStreakRef.current = 0;
        } else if (res.status === "CONFLICT") {
          await markEventConflict(e.event_id, res.reason);
          setConflicts((c) => c + 1);
        } else {
          // Transient error: stop this pass and retry later. Keep it locally.
          failStreakRef.current += 1;
          break;
        }
      }
    } finally {
      runningRef.current = false;
      setSyncing(false);
    }

    if (synced > 0) setLastSyncedAt(Date.now());
    await refreshCounts();

    const remaining = await countPending(competitionId);
    const stillOnline =
      typeof navigator === "undefined" ? true : navigator.onLine;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (remaining > 0 && stillOnline) {
      const delay =
        BACKOFF[Math.min(failStreakRef.current, BACKOFF.length - 1)] ?? 30000;
      timerRef.current = setTimeout(() => drainRef.current(), delay);
    } else if (synced > 0) {
      toast.success(
        `${synced} event${synced > 1 ? "s" : ""} synchronized`,
        { description: "Competition data is up to date." }
      );
    }
  }, [competitionId, refreshCounts]);

  const syncNow = useCallback(() => {
    failStreakRef.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
    void drain();
  }, [drain]);

  useEffect(() => {
    drainRef.current = () => void drain();
  }, [drain]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshCounts();
      if (!cancelled) void drain();
    })();

    const onOnline = () => {
      setOnline(true);
      syncNow();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refreshCounts, drain, syncNow]);

  return { online, syncing, pending, conflicts, lastSyncedAt, syncNow };
}
