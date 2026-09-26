import type {
  CompetitionPackage,
  EngineEvent,
  EngineQuestion,
  LiveState,
} from "@/features/engine/types";
import type { QuestionStatus } from "@/lib/permissions/roles";

/** Deterministic live engine reducer (spec §29–§35, §51–§53). Pure. */

export function createInitialState(pkg: CompetitionPackage): LiveState {
  const questions: EngineQuestion[] = pkg.questions.map((q) => ({
    id: q.id,
    questionNumber: q.questionNumber,
    points: q.points,
    timeLimit: q.timeLimit,
    status: "AVAILABLE",
  }));
  const firstTeam = pkg.teams[0];
  return {
    competitionId: pkg.competitionId,
    status: "IDLE",
    teams: pkg.teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      color: t.color,
      currentScore: t.currentScore,
    })),
    questions,
    currentTeamId: pkg.firstTeamId ?? firstTeam?.id ?? "",
    active: null,
    lastEventSequence: 0,
    locked: false,
    pausedAt: null,
    history: [],
  };
}

function withQuestionStatus(
  state: LiveState,
  questionId: string,
  status: QuestionStatus
): LiveState {
  return {
    ...state,
    questions: state.questions.map((q) =>
      q.id === questionId ? { ...q, status } : q
    ),
  };
}

function opponentId(state: LiveState, teamId: string): string {
  const other = state.teams.find((t) => t.id !== teamId);
  return other?.id ?? teamId;
}

function award(state: LiveState, teamId: string, points: number): LiveState {
  return {
    ...state,
    teams: state.teams.map((t) =>
      t.id === teamId ? { ...t, currentScore: t.currentScore + points } : t
    ),
  };
}

/**
 * Fold one event into state. Never throws and never reads the clock — timing
 * comes from event payloads so replay is deterministic (spec §35). Events at or
 * below the last applied sequence are ignored for idempotency (spec §38).
 */
export function applyEvent(
  state: LiveState,
  event: EngineEvent
): LiveState {
  if (event.sequence_number <= state.lastEventSequence) return state;

  const base: LiveState = { ...state, lastEventSequence: event.sequence_number };
  const p = event.payload;

  switch (event.event_type) {
    case "COMPETITION_STARTED":
      return { ...base, status: "LIVE" };

    case "COMPETITION_PAUSED":
      return { ...base, status: "PAUSED", pausedAt: Number(p.at ?? event.created_at) };

    case "COMPETITION_RESUMED": {
      const at = Number(p.at ?? event.created_at);
      const active = base.active;
      let nextActive = active;
      // Shift an in-flight timer by however long we were paused (spec §53).
      if (active && active.expiresAt != null && base.pausedAt != null) {
        const delta = at - base.pausedAt;
        nextActive = {
          ...active,
          startedAt: (active.startedAt ?? 0) + delta,
          expiresAt: active.expiresAt + delta,
        };
      }
      return { ...base, status: "LIVE", pausedAt: null, active: nextActive };
    }

    case "COMPETITION_LOCKED":
      return { ...base, locked: true };
    case "COMPETITION_UNLOCKED":
      return { ...base, locked: false };

    case "QUESTION_SELECTED": {
      if (!base.active) {
        const active = {
          questionId: String(p.questionId),
          points: Number(p.points),
          phase: "SELECTED" as const,
          primaryTeamId: String(p.teamId),
          bonusTeamId: null,
          attemptId: null,
          startedAt: null,
          expiresAt: null,
          primaryResult: null,
          bonusResult: null,
        };
        return withQuestionStatus(
          { ...base, active },
          active.questionId,
          "SELECTED"
        );
      }
      return base;
    }

    case "QUESTION_STARTED": {
      if (!base.active) return base;
      return withQuestionStatus(
        {
          ...base,
          active: {
            ...base.active,
            phase: "ANSWERING",
            attemptId: String(p.attemptId),
            startedAt: Number(p.startedAt),
            expiresAt: Number(p.expiresAt),
          },
        },
        base.active.questionId,
        "ANSWERING"
      );
    }

    case "ANSWER_SUBMITTED": {
      const active = base.active;
      if (!active) return base;
      const result = String(p.result) as "CORRECT" | "WRONG" | "TIMEOUT";
      if (result === "CORRECT") {
        // Primary team answered correctly: award once, then complete.
        const awarded = award(base, active.primaryTeamId, active.points);
        return finalize(
          {
            ...awarded,
            history: [
              ...awarded.history,
              {
                questionId: active.questionId,
                teamId: active.primaryTeamId,
                result: "CORRECT",
                pointsAwarded: active.points,
              },
            ],
          },
          active.questionId
        );
      }
      // Failed primary → offer a bonus to the opposing team (spec §20/§22).
      return withQuestionStatus(
        {
          ...base,
          active: {
            ...active,
            phase: "FAILED",
            primaryResult: result,
            bonusTeamId: opponentId(base, active.primaryTeamId),
          },
          history: [
            ...base.history,
            {
              questionId: active.questionId,
              teamId: active.primaryTeamId,
              result,
              pointsAwarded: 0,
            },
          ],
        },
        active.questionId,
        "FAILED"
      );
    }

    case "BONUS_STARTED": {
      if (!base.active) return base;
      return withQuestionStatus(
        {
          ...base,
          active: {
            ...base.active,
            phase: "BONUS_ANSWERING",
            bonusTeamId: String(p.bonusTeamId),
            attemptId: String(p.attemptId),
            startedAt: Number(p.startedAt),
            expiresAt: Number(p.expiresAt),
          },
        },
        base.active.questionId,
        "BONUS_ANSWERING"
      );
    }

    case "BONUS_ANSWER_SUBMITTED": {
      const active = base.active;
      if (!active || !active.bonusTeamId) return base;
      const result = String(p.result) as "CORRECT" | "WRONG" | "TIMEOUT";
      const bonusTeamId = active.bonusTeamId;
      if (result === "CORRECT") {
        const awarded = award(base, bonusTeamId, active.points);
        return finalize(
          {
            ...awarded,
            history: [
              ...awarded.history,
              {
                questionId: active.questionId,
                teamId: bonusTeamId,
                result: "CORRECT",
                pointsAwarded: active.points,
              },
            ],
          },
          active.questionId
        );
      }
      // Both teams failed → no points, reveal, complete (spec §24).
      return finalize({
        ...base,
        history: [
          ...base.history,
          {
            questionId: active.questionId,
            teamId: bonusTeamId,
            result,
            pointsAwarded: 0,
          },
        ],
      }, active.questionId);
    }

    case "QUESTION_COMPLETED": {
      const active = base.active;
      if (!active) return base;
      return finalize(base, active.questionId);
    }

    case "SCORE_ADJUSTED": {
      const teamId = String(p.teamId);
      const delta = Number(p.adjustment);
      return {
        ...base,
        teams: base.teams.map((t) =>
          t.id === teamId ? { ...t, currentScore: t.currentScore + delta } : t
        ),
      };
    }

    case "COMPETITION_COMPLETED":
      return { ...base, status: "COMPLETED", active: null };

    default:
      return base;
  }
}

/** Mark the active question COMPLETED, clear it, and flip the turn (spec §51). */
function finalize(state: LiveState, questionId: string): LiveState {
  const nextTeam = state.active
    ? opponentId(state, state.active.primaryTeamId)
    : state.currentTeamId;
  const cleared: LiveState = { ...state, active: null, currentTeamId: nextTeam };
  return withQuestionStatus(cleared, questionId, "COMPLETED");
}

/** Deterministic replay of an ordered event log (spec §35). */
export function replay(initial: LiveState, events: EngineEvent[]): LiveState {
  return events.reduce(applyEvent, initial);
}
