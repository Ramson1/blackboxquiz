"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { syncLiveEventAction } from "@/features/live/actions";
import {
  type Dispatcher,
  type LiveEngineApi,
  type RunResult,
  getDeviceId,
  makeId,
} from "@/features/live/engine-api";
import {
  commit,
  completeCompetition,
  completeQuestion,
  lockCompetitionEvent,
  pauseCompetition,
  resumeCompetition,
  selectQuestion,
  startBonus,
  startCompetition,
  startQuestion,
  submitBonusAnswer,
  submitPrimaryAnswer,
  unlockCompetitionEvent,
} from "@/features/engine";
import type { CommandContext, LiveState } from "@/features/engine/types";

export type { RunResult } from "@/features/live/engine-api";

/**
 * Online live engine (spec §29). Every operator action runs the pure engine
 * command against local state, updates the UI immediately, and only then records
 * the event server-side — the UI never blocks on the network. Failed persists
 * are surfaced but keep the local state (offline-first; the sync layer retries).
 */
export function useLiveEngine(initial: LiveState): LiveEngineApi {
  const [state, setState] = useState<LiveState>(initial);
  // Kept in sync with `state` inside `run`; never assigned during render.
  const stateRef = useRef(state);

  const run = useCallback((dispatch: Dispatcher): RunResult => {
    const ctx: CommandContext = {
      now: Date.now(),
      deviceId: getDeviceId(),
      nextId: makeId,
    };
    const result = dispatch(stateRef.current, ctx);
    const committed = commit(stateRef.current, result);
    if ("error" in committed) {
      toast.error(committed.error);
      return { ok: false, error: committed.error };
    }
    // Optimistic local update first (spec §29: never UI → API → wait → UI).
    stateRef.current = committed.state;
    setState(committed.state);
    for (const e of committed.events) {
      void syncLiveEventAction(e).then((res) => {
        if (res.status === "CONFLICT")
          toast.error(`Sync conflict: ${res.reason}`);
        else if (res.status === "ERROR")
          toast.error(`Sync failed: ${res.error}`);
      });
    }
    return { ok: true, state: committed.state };
  }, []);

  return {
    state,
    start: () => run((s, c) => startCompetition(s, c)),
    select: (questionId: string) => run((s, c) => selectQuestion(s, c, questionId)),
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
    lock: (reason?: string) => run((s, c) => lockCompetitionEvent(s, c, reason)),
    unlock: () => run((s, c) => unlockCompetitionEvent(s, c)),
  };
}
