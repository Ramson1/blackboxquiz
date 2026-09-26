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
import type { LiveContentMap } from "@/features/live/types";
import {
  appendLocalEvent,
  checkCompleteness,
  getPackage,
  loadLocalEvents,
  saveSnapshot,
  toContentMap,
  toEnginePackage,
  toPointColors,
  type CompletenessReport,
} from "@/lib/offline/store";
import type { DownloadablePackage } from "@/features/offline/package-types";

export type OfflineStatus = "loading" | "missing" | "incomplete" | "ready";

export interface OfflineCompetition {
  status: OfflineStatus;
  pkg: DownloadablePackage | null;
  completeness: CompletenessReport | null;
  contentMap: LiveContentMap;
  pointColors: Record<string, string>;
  competitionName: string;
  allowBonus: boolean;
  engine: LiveEngineApi | null;
  reload: () => void;
}

/**
 * Offline live engine (spec §29–§33, §42–§43). Reconstructs state by replaying
 * the locally stored event log over the downloaded package, then runs the same
 * pure engine commands — but persists every committed event to IndexedDB first
 * (source of truth) and only best-effort pushes to the server when online. A
 * refresh or crash recovers the exact state (including the running timer) from
 * local storage, so competition control never depends on the network.
 */
export function useOfflineCompetition(
  competitionId: string,
  opts?: { onEventsAppended?: (events: EngineEvent[]) => void }
): OfflineCompetition {
  const [status, setStatus] = useState<OfflineStatus>("loading");
  const [pkg, setPkg] = useState<DownloadablePackage | null>(null);
  const [completeness, setCompleteness] =
    useState<CompletenessReport | null>(null);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [nonce, setNonce] = useState(0);

  // Live state mirror for command dispatch; never assigned during render.
  const stateRef = useRef<LiveState | null>(null);
  // Keep the latest sync callback without making `run` depend on it.
  const notifyRef = useRef(opts?.onEventsAppended);
  useEffect(() => {
    notifyRef.current = opts?.onEventsAppended;
  }, [opts?.onEventsAppended]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await getPackage(competitionId);
      const report = checkCompleteness(loaded);
      if (cancelled) return;
      setPkg(loaded);
      setCompleteness(report);
      if (!loaded) {
        setStatus("missing");
        return;
      }
      if (!report.ok) {
        setStatus("incomplete");
        return;
      }
      const events = await loadLocalEvents(competitionId);
      const initial = createInitialState(toEnginePackage(loaded));
      const recovered = replay(initial, events);
      if (cancelled) return;
      stateRef.current = recovered;
      setLiveState(recovered);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [competitionId, nonce]);

  const run = useCallback((dispatch: Dispatcher): RunResult => {
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

    // Local-first: update UI + persist to IndexedDB before any network call.
    stateRef.current = committed.state;
    setLiveState(committed.state);
    void saveSnapshot(committed.state);

    // Local-first: persist every committed event to IndexedDB (the source of
    // truth), then notify the sync engine to drain the queue. Never blocks the
    // UI on the network (spec §29, §36).
    void Promise.all(committed.events.map((e) => appendLocalEvent(e))).then(
      () => notifyRef.current?.(committed.events)
    );
    return { ok: true, state: committed.state };
  }, []);

  const engine: LiveEngineApi | null = liveState
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

  return {
    status,
    pkg,
    completeness,
    contentMap: pkg ? toContentMap(pkg) : {},
    pointColors: pkg ? toPointColors(pkg) : {},
    competitionName: pkg?.competition.name ?? "",
    allowBonus:
      (pkg?.competition.settings as { allow_timeout_bonus?: boolean })
        ?.allow_timeout_bonus !== false,
    engine,
    reload: () => setNonce((n) => n + 1),
  };
}
