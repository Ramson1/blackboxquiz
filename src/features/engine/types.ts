import type { EventType } from "@/lib/events/event-types";
import type { QuestionStatus } from "@/lib/permissions/roles";

/**
 * Deterministic live-competition engine (spec §29–§35, §51–§53).
 *
 * The engine is event-sourced and pure: it never reads the clock or generates
 * ids itself. Commands receive a {@link CommandContext} (clock + id source) and
 * return events; the reducer folds events into state. This makes the exact same
 * logic usable offline in Dexie (Task 13), for optimistic UI (Task 11), and for
 * deterministic server replay/recovery (Task 14).
 */

export type AttemptResult = "CORRECT" | "WRONG" | "TIMEOUT";

/** Runtime phase of the question currently on screen. */
export type ActivePhase =
  | "SELECTED"
  | "ANSWERING"
  | "FAILED"
  | "BONUS_ANSWERING";

export interface EngineTeam {
  id: string;
  name: string;
  shortName: string | null;
  color: string;
  currentScore: number;
}

export interface EngineQuestion {
  id: string;
  questionNumber: number;
  points: number;
  timeLimit: number; // seconds
  status: QuestionStatus;
}

export interface ActiveQuestion {
  questionId: string;
  points: number;
  phase: ActivePhase;
  /** Team that selected/answered first. */
  primaryTeamId: string;
  /** Opposing team when the primary failed. */
  bonusTeamId: string | null;
  attemptId: string | null;
  startedAt: number | null; // epoch ms
  expiresAt: number | null; // epoch ms
  primaryResult: AttemptResult | null;
  bonusResult: AttemptResult | null;
}

export type LiveStatus = "IDLE" | "LIVE" | "PAUSED" | "COMPLETED";

export interface LiveState {
  competitionId: string;
  status: LiveStatus;
  teams: EngineTeam[];
  questions: EngineQuestion[];
  /** Which team selects/answers next (spec §51). */
  currentTeamId: string;
  active: ActiveQuestion | null;
  lastEventSequence: number;
  locked: boolean;
  /** Epoch ms the competition was paused, to shift the active timer on resume. */
  pausedAt: number | null;
  /** Points awarded over time, for question-by-question results (Task 17). */
  history: {
    questionId: string;
    teamId: string | null;
    result: AttemptResult;
    pointsAwarded: number;
  }[];
}

/** A committed engine event. Times are epoch ms; ids are assigned upstream. */
export interface EngineEvent {
  event_id: string;
  competition_id: string;
  device_id: string;
  sequence_number: number;
  created_at: number;
  event_type: EventType;
  payload: Record<string, unknown>;
}

/** Injected non-deterministic sources so the engine itself stays pure. */
export interface CommandContext {
  now: number; // epoch ms
  deviceId: string;
  nextId: () => string;
}

export type CommandResult =
  | { ok: true; events: EngineEvent[] }
  | { ok: false; error: string };

/** Everything needed to build the starting state from a downloaded package. */
export interface CompetitionPackage {
  competitionId: string;
  teams: {
    id: string;
    name: string;
    shortName: string | null;
    color: string;
    currentScore: number;
  }[];
  questions: {
    id: string;
    questionNumber: number;
    points: number;
    timeLimit: number;
  }[];
  firstTeamId?: string;
}
