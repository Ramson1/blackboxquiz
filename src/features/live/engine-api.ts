import type {
  CommandContext,
  CommandResult,
  LiveState,
} from "@/features/engine/types";

/**
 * Shared contract for any live-engine driver. The online hook persists events to
 * the server; the offline hook persists them to IndexedDB and queues them for
 * sync. The console UI depends only on this interface (spec §29 offline-first).
 */
export interface LiveEngineApi {
  state: LiveState;
  start: () => RunResult;
  select: (questionId: string) => RunResult;
  startQuestion: () => RunResult;
  submitPrimary: (
    result: "CORRECT" | "WRONG" | "TIMEOUT",
    optionId?: string
  ) => RunResult;
  startBonus: () => RunResult;
  submitBonus: (
    result: "CORRECT" | "WRONG" | "TIMEOUT",
    optionId?: string
  ) => RunResult;
  revealWithoutBonus: () => RunResult;
  pause: () => RunResult;
  resume: () => RunResult;
  complete: () => RunResult;
  lock: (reason?: string) => RunResult;
  unlock: () => RunResult;
}

/** Result of running a command against the local engine. */
export type RunResult =
  | { ok: true; state: LiveState }
  | { ok: false; error: string };

/** A command dispatcher bound to the pure engine. */
export type Dispatcher = (
  state: LiveState,
  ctx: CommandContext
) => CommandResult;

const DEVICE_KEY = "blackboxquiz:device-id";

/** Unique, monotonic-ish id (uuid when available). */
export function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Stable per-tab device id. Resolved lazily inside event handlers (never during
 * render) so components stay pure; persisted in sessionStorage so a refresh or
 * crash reuses the same identity (spec §42/§43).
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.sessionStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = makeId();
    window.sessionStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
