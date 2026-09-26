import type { EventType } from "@/lib/events/event-types";
import {
  applyEvent,
  createInitialState,
} from "@/features/engine/reducer";
import type {
  CommandContext,
  CommandResult,
  CompetitionPackage,
  EngineEvent,
  LiveState,
} from "@/features/engine/types";

/**
 * Live engine command handlers (spec §17–§24, §51–§53). Each validates the
 * operator's intent against the current state and, if legal, returns the single
 * event to commit. The reducer performs the state transition. Committing a
 * command via {@link commit} is what the UI/offline layer calls.
 */

function event(
  state: LiveState,
  ctx: CommandContext,
  type: EventType,
  payload: Record<string, unknown> = {}
): EngineEvent {
  return {
    event_id: ctx.nextId(),
    competition_id: state.competitionId,
    device_id: ctx.deviceId,
    sequence_number: state.lastEventSequence + 1,
    created_at: ctx.now,
    event_type: type,
    payload,
  };
}

function fail(error: string): CommandResult {
  return { ok: false, error };
}

function ok(state: LiveState, e: EngineEvent): CommandResult {
  return { ok: true, events: [e] };
}

/** Guard shared by all in-competition actions. */
function actionable(state: LiveState): string | null {
  if (state.locked) return "This competition is locked";
  if (state.status !== "LIVE") return "This competition is not live";
  return null;
}

export function startCompetition(
  state: LiveState,
  ctx: CommandContext
): CommandResult {
  if (state.locked) return fail("This competition is locked");
  if (state.status !== "IDLE") return fail("This competition has already started");
  if (state.teams.length !== 2) return fail("A competition needs exactly two teams");
  return ok(state, event(state, ctx, "COMPETITION_STARTED"));
}

export function selectQuestion(
  state: LiveState,
  ctx: CommandContext,
  questionId: string
): CommandResult {
  const guard = actionable(state);
  if (guard) return fail(guard);
  if (state.active) return fail("Finish the current question first");
  const q = state.questions.find((x) => x.id === questionId);
  if (!q) return fail("Question not found");
  if (q.status !== "AVAILABLE") return fail("That question is no longer available");
  // Only AVAILABLE questions may be selected (spec §17) — enforced above and
  // transactionally by the single-active guard.
  return ok(
    state,
    event(state, ctx, "QUESTION_SELECTED", {
      questionId,
      points: q.points,
      teamId: state.currentTeamId,
    })
  );
}

export function startQuestion(
  state: LiveState,
  ctx: CommandContext
): CommandResult {
  const guard = actionable(state);
  if (guard) return fail(guard);
  const active = state.active;
  if (!active || active.phase !== "SELECTED")
    return fail("No selected question to start");
  const q = state.questions.find((x) => x.id === active.questionId);
  const startedAt = ctx.now;
  const expiresAt = startedAt + (q?.timeLimit ?? 30) * 1000;
  return ok(
    state,
    event(state, ctx, "QUESTION_STARTED", {
      questionId: active.questionId,
      attemptId: ctx.nextId(),
      startedAt,
      expiresAt,
    })
  );
}

/**
 * Record the primary team's outcome (spec §19/§20/§23). `result` is decided by
 * the operator comparing the chosen option to the correct answer (or a timeout).
 */
export function submitPrimaryAnswer(
  state: LiveState,
  ctx: CommandContext,
  result: "CORRECT" | "WRONG" | "TIMEOUT",
  optionId?: string
): CommandResult {
  const guard = actionable(state);
  if (guard) return fail(guard);
  const active = state.active;
  if (!active || active.phase !== "ANSWERING")
    return fail("No question is currently being answered");
  return ok(
    state,
    event(state, ctx, "ANSWER_SUBMITTED", {
      questionId: active.questionId,
      attemptId: active.attemptId,
      teamId: active.primaryTeamId,
      points: active.points,
      result,
      optionId: optionId ?? null,
    })
  );
}

/** Offer the failed question to the opposing team as a bonus (spec §21/§22). */
export function startBonus(
  state: LiveState,
  ctx: CommandContext
): CommandResult {
  const guard = actionable(state);
  if (guard) return fail(guard);
  const active = state.active;
  if (!active || active.phase !== "FAILED")
    return fail("There is no failed question to offer as a bonus");
  if (!active.bonusTeamId) return fail("No bonus team is available");
  const q = state.questions.find((x) => x.id === active.questionId);
  const startedAt = ctx.now;
  const expiresAt = startedAt + (q?.timeLimit ?? 30) * 1000;
  return ok(
    state,
    event(state, ctx, "BONUS_STARTED", {
      questionId: active.questionId,
      bonusTeamId: active.bonusTeamId,
      attemptId: ctx.nextId(),
      startedAt,
      expiresAt,
    })
  );
}

export function submitBonusAnswer(
  state: LiveState,
  ctx: CommandContext,
  result: "CORRECT" | "WRONG" | "TIMEOUT",
  optionId?: string
): CommandResult {
  const guard = actionable(state);
  if (guard) return fail(guard);
  const active = state.active;
  if (!active || active.phase !== "BONUS_ANSWERING")
    return fail("No bonus is currently being answered");
  return ok(
    state,
    event(state, ctx, "BONUS_ANSWER_SUBMITTED", {
      questionId: active.questionId,
      attemptId: active.attemptId,
      teamId: active.bonusTeamId,
      points: active.points,
      result,
      optionId: optionId ?? null,
    })
  );
}

/**
 * Finish the active question without a bonus attempt (operator reveals the
 * answer after the primary failed and declines to offer the bonus, spec §24).
 */
export function completeQuestion(
  state: LiveState,
  ctx: CommandContext
): CommandResult {
  const guard = actionable(state);
  if (guard) return fail(guard);
  const active = state.active;
  if (!active) return fail("There is no active question");
  if (active.phase !== "FAILED")
    return fail("Only a failed question can be revealed without a bonus");
  return ok(
    state,
    event(state, ctx, "QUESTION_COMPLETED", { questionId: active.questionId })
  );
}

export function pauseCompetition(
  state: LiveState,
  ctx: CommandContext
): CommandResult {
  if (state.locked) return fail("This competition is locked");
  if (state.status !== "LIVE") return fail("Only a live competition can be paused");
  return ok(state, event(state, ctx, "COMPETITION_PAUSED", { at: ctx.now }));
}

export function resumeCompetition(
  state: LiveState,
  ctx: CommandContext
): CommandResult {
  if (state.locked) return fail("This competition is locked");
  if (state.status !== "PAUSED") return fail("Only a paused competition can be resumed");
  return ok(state, event(state, ctx, "COMPETITION_RESUMED", { at: ctx.now }));
}

export function completeCompetition(
  state: LiveState,
  ctx: CommandContext
): CommandResult {
  if (state.locked) return fail("This competition is locked");
  if (state.status === "COMPLETED") return fail("Already completed");
  if (state.status === "IDLE") return fail("The competition has not started");
  return ok(state, event(state, ctx, "COMPETITION_COMPLETED"));
}

export function lockCompetitionEvent(
  state: LiveState,
  ctx: CommandContext,
  reason?: string
): CommandResult {
  if (state.locked) return fail("Already locked");
  return ok(state, event(state, ctx, "COMPETITION_LOCKED", { reason: reason ?? null }));
}

export function unlockCompetitionEvent(
  state: LiveState,
  ctx: CommandContext
): CommandResult {
  if (!state.locked) return fail("Not locked");
  return ok(state, event(state, ctx, "COMPETITION_UNLOCKED"));
}

/** Apply a command's events to the state, returning the next state. */
export function commit(
  state: LiveState,
  result: CommandResult
): { state: LiveState; events: EngineEvent[] } | { error: string } {
  if (!result.ok) return { error: result.error };
  const next = result.events.reduce(applyEvent, state);
  return { state: next, events: result.events };
}

export { createInitialState };
export type { CompetitionPackage };
