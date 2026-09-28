"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  commit,
  completeCompetition,
  completeQuestion,
  createInitialState,
  lockCompetitionEvent,
  pauseCompetition,
  replay,
  resumeCompetition,
  selectQuestion,
  startBonus,
  startCompetition,
  startQuestion,
  submitBonusAnswer,
  submitPrimaryAnswer,
  unlockCompetitionEvent,
} from "@/features/engine";
import type {
  CommandContext,
  EngineEvent,
  LiveState,
} from "@/features/engine/types";
import {
  type Dispatcher,
  type LiveEngineApi,
  type RunResult,
  getDeviceId,
  makeId,
} from "@/features/live/engine-api";
import { toEnginePackage } from "@/lib/offline/store";
import type { DownloadablePackage } from "@/features/offline/package-types";
import { publicRecordEventsAction } from "./actions";
import { PUBLIC_STATE_KEY, clearRunCredential } from "./run-storage";

/**
 * Third LiveEngineApi driver: the PUBLIC run screen (plan §E). Same pure
 * engine as the online/offline consoles, but persistence is (a) a
 * sessionStorage snapshot after every commit — refresh-safe on the projector
 * laptop — and (b) batched flushes of the committed events to
 * `blackboxquiz_public_record_events`, which re-derives scores server-side
 * through the standard projection trigger. Failed flushes stay queued and
 * retry on the next commit or when the browser returns online.
 */

interface PublicSnapshot {
  competitionId: string;
  state: LiveState;
  pending: EngineEvent[];
}

function loadSnapshot(competitionId: string): PublicSnapshot | null {
  try {
    const raw = sessionStorage.getItem(PUBLIC_STATE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as PublicSnapshot;
    return snap.competitionId === competitionId ? snap : null;
  } catch {
    return null;
  }
}

function storeSnapshot(snap: PublicSnapshot): void {
  try {
    sessionStorage.setItem(PUBLIC_STATE_KEY, JSON.stringify(snap));
  } catch {
    /* quota/private mode — flushes still protect the server-side log */
  }
}

const FLUSH_DEBOUNCE_MS = 600;

export function usePublicRun(
  pkg: DownloadablePackage,
  password: string,
  serverEvents: EngineEvent[]
): LiveEngineApi | null {
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const stateRef = useRef<LiveState | null>(null);
  const pendingRef = useRef<EngineEvent[]>([]);
  const flushingRef = useRef(false);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest flush, so the debounce timer never calls a stale closure.
  const flushRef = useRef<() => void>(() => {});

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => flushRef.current(), FLUSH_DEBOUNCE_MS);
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current || pendingRef.current.length === 0) return;
    flushingRef.current = true;
    const batch = pendingRef.current.slice();
    try {
      const res = await publicRecordEventsAction({
        competitionId: pkg.competition.id,
        password,
        events: batch,
      });
      if (res.ok) {
        // Drop exactly what we sent; anything queued during the call stays.
        pendingRef.current = pendingRef.current.slice(batch.length);
        const base = stateRef.current;
        if (base) {
          storeSnapshot({
            competitionId: pkg.competition.id,
            state: base,
            pending: pendingRef.current,
          });
        }
        const done = batch.some(
          (e) => e.event_type === "COMPETITION_COMPLETED"
        );
        if (done) clearRunCredential();
      } else {
        toast.error(res.error || "Progress saved locally — retrying soon");
      }
    } catch {
      /* network down — queue persists in sessionStorage and retries below */
    } finally {
      flushingRef.current = false;
      if (pendingRef.current.length > 0) scheduleFlush();
    }
  }, [pkg.competition.id, password, scheduleFlush]);

  useEffect(() => {
    flushRef.current = () => void flush();
  }, [flush]);

  // Seed once: server replay, unless a fresher sessionStorage snapshot from
  // this very tab survives a refresh (crash-safe resume).
  useEffect(() => {
    void (async () => {
      const snap = loadSnapshot(pkg.competition.id);
      if (snap?.state) {
        stateRef.current = snap.state;
        pendingRef.current = snap.pending ?? [];
        setLiveState(snap.state);
        if (pendingRef.current.length > 0) scheduleFlush();
        return;
      }
      const initial = replay(
        createInitialState(toEnginePackage(pkg)),
        serverEvents ?? []
      );
      stateRef.current = initial;
      setLiveState(initial);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg.competition.id]);

  // Retry the queue when connectivity returns; try a last flush when the tab
  // is hidden or closed (best effort — the snapshot covers the rest).
  useEffect(() => {
    const onOnline = () => flushRef.current();
    const onHide = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHide);
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
  }, []);

  const run = useCallback(
    (dispatch: Dispatcher): RunResult => {
      const base = stateRef.current;
      if (!base) return { ok: false, error: "Competition is not ready" };
      const ctx: CommandContext = {
        now: Date.now(),
        deviceId: getDeviceId(),
        nextId: makeId,
      };
      const result = dispatch(base, ctx);
      const committed = commit(base, result);
      if ("error" in committed) {
        toast.error(committed.error);
        return { ok: false, error: committed.error };
      }

      // Local-first: update UI + snapshot, then queue a debounced flush.
      stateRef.current = committed.state;
      setLiveState(committed.state);
      pendingRef.current = [...pendingRef.current, ...committed.events];
      storeSnapshot({
        competitionId: pkg.competition.id,
        state: committed.state,
        pending: pendingRef.current,
      });
      scheduleFlush();
      return { ok: true, state: committed.state };
    },
    [pkg.competition.id, scheduleFlush]
  );

  return liveState
    ? {
        state: liveState,
        start: () => run((s, c) => startCompetition(s, c)),
        select: (questionId: string) =>
          run((s, c) => selectQuestion(s, c, questionId)),
        startQuestion: () => run((s, c) => startQuestion(s, c)),
        submitPrimary: (
          result: "CORRECT" | "WRONG" | "TIMEOUT",
          optionId?: string
        ) => run((s, c) => submitPrimaryAnswer(s, c, result, optionId)),
        startBonus: () => run((s, c) => startBonus(s, c)),
        submitBonus: (
          result: "CORRECT" | "WRONG" | "TIMEOUT",
          optionId?: string
        ) => run((s, c) => submitBonusAnswer(s, c, result, optionId)),
        revealWithoutBonus: () => run((s, c) => completeQuestion(s, c)),
        pause: () => run((s, c) => pauseCompetition(s, c)),
        resume: () => run((s, c) => resumeCompetition(s, c)),
        complete: () => run((s, c) => completeCompetition(s, c)),
        lock: (reason?: string) =>
          run((s, c) => lockCompetitionEvent(s, c, reason)),
        unlock: () => run((s, c) => unlockCompetitionEvent(s, c)),
      }
    : null;
}

/** True when a resumable snapshot exists (used to skip the rules screens). */
export function hasPublicRunSnapshot(competitionId: string): boolean {
  return loadSnapshot(competitionId) != null;
}
