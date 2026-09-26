import {
  buildCompetitionPackage,
  loadEvents,
} from "@/services/live/live-service";
import type { EngineEvent } from "@/features/engine/types";
import type {
  AttemptOutcome,
  CompetitionResults,
  QuestionResult,
  ResultsStatus,
  TeamResultStats,
} from "@/features/results/types";

/**
 * Results computation (spec §58, §59, §84, §108). Every number is reconstructed
 * from the append-only event log — never read straight off the mutable scoreboard.
 * Pure given the package + event list, so the same code can run for exports.
 */

function outcome(value: unknown): AttemptOutcome {
  const v = String(value ?? "").toUpperCase();
  if (v === "CORRECT" || v === "WRONG" || v === "TIMEOUT") return v;
  return "NONE";
}

export function computeResults(
  pkg: Awaited<ReturnType<typeof buildCompetitionPackage>>,
  events: EngineEvent[]
): CompetitionResults {
  const teams = new Map<string, TeamResultStats>();
  for (const t of pkg.teams) {
    teams.set(t.id, {
      teamId: t.id,
      name: t.name,
      shortName: t.shortName,
      color: t.color,
      startingScore: t.currentScore,
      finalScore: t.currentScore,
      questionsSelected: 0,
      correct: 0,
      wrong: 0,
      timeouts: 0,
      bonusReceived: 0,
      bonusCorrect: 0,
      bonusWrong: 0,
      adjustments: 0,
      pointsGained: 0,
      attempted: 0,
    });
  }

  const questions = new Map<string, QuestionResult>();
  const metaById = new Map(pkg.questions.map((q) => [q.id, q]));
  const ensureQuestion = (questionId: string): QuestionResult => {
    let qr = questions.get(questionId);
    if (!qr) {
      const meta = metaById.get(questionId);
      qr = {
        questionId,
        questionNumber: meta?.questionNumber ?? 0,
        points: meta?.points ?? 0,
        primaryTeamId: null,
        primaryResult: "NONE",
        bonusTeamId: null,
        bonusResult: "NONE",
        awardedTeamId: null,
        pointsAwarded: 0,
      };
      questions.set(questionId, qr);
    }
    return qr;
  };

  let status: ResultsStatus = "IDLE";
  let paused = false;

  for (const e of events) {
    const p = e.payload;
    switch (e.event_type) {
      case "COMPETITION_STARTED":
        status = "LIVE";
        break;
      case "COMPETITION_PAUSED":
        paused = true;
        break;
      case "COMPETITION_RESUMED":
        paused = false;
        break;
      case "COMPETITION_COMPLETED":
        status = "COMPLETED";
        break;

      case "QUESTION_SELECTED": {
        const team = teams.get(String(p.teamId));
        if (team) team.questionsSelected += 1;
        const qr = ensureQuestion(String(p.questionId));
        qr.primaryTeamId = String(p.teamId);
        if (typeof p.points === "number") qr.points = p.points;
        else if (!qr.points) {
          qr.points = metaById.get(String(p.questionId))?.points ?? qr.points;
        }
        break;
      }

      case "ANSWER_SUBMITTED": {
        const team = teams.get(String(p.teamId));
        const qr = ensureQuestion(String(p.questionId));
        const result = outcome(p.result);
        qr.primaryTeamId = qr.primaryTeamId ?? String(p.teamId);
        qr.primaryResult = result;
        if (team) {
          team.attempted += 1;
          if (result === "CORRECT") {
            team.correct += 1;
            team.pointsGained += qr.points;
            qr.awardedTeamId = team.teamId;
            qr.pointsAwarded += qr.points;
          } else if (result === "WRONG") {
            team.wrong += 1;
          } else if (result === "TIMEOUT") {
            team.timeouts += 1;
          }
        }
        break;
      }

      case "BONUS_STARTED": {
        const bonusTeam = teams.get(String(p.bonusTeamId));
        if (bonusTeam) bonusTeam.bonusReceived += 1;
        const qr = ensureQuestion(String(p.questionId));
        qr.bonusTeamId = String(p.bonusTeamId);
        break;
      }

      case "BONUS_ANSWER_SUBMITTED": {
        const team = teams.get(String(p.teamId));
        const qr = ensureQuestion(String(p.questionId));
        const result = outcome(p.result);
        qr.bonusTeamId = qr.bonusTeamId ?? String(p.teamId);
        qr.bonusResult = result;
        if (team) {
          team.attempted += 1;
          if (result === "CORRECT") {
            team.bonusCorrect += 1;
            team.pointsGained += qr.points;
            qr.awardedTeamId = team.teamId;
            qr.pointsAwarded += qr.points;
          } else {
            team.bonusWrong += 1;
          }
        }
        break;
      }

      case "SCORE_ADJUSTED": {
        const team = teams.get(String(p.teamId));
        if (team) team.adjustments += Number(p.adjustment) || 0;
        break;
      }
    }
  }

  if (status === "LIVE" && paused) status = "PAUSED";

  const teamList = [...teams.values()];
  for (const t of teamList) {
    t.finalScore = t.startingScore + t.pointsGained + t.adjustments;
  }

  const questionList = [...questions.values()].sort(
    (a, b) => a.questionNumber - b.questionNumber
  );
  const attemptedQuestions = questionList.filter(
    (q) => q.primaryResult !== "NONE" || q.bonusResult !== "NONE"
  ).length;

  const started = status !== "IDLE";
  const isDraw =
    started &&
    teamList.length > 0 &&
    teamList.every((t) => t.finalScore === teamList[0].finalScore);

  return {
    competitionId: pkg.competitionId,
    status,
    teams: teamList,
    questions: questionList,
    totalQuestions: pkg.questions.length,
    attemptedQuestions,
    isDraw,
  };
}

/** Server entry point: rebuilds results for a competition from the log. */
export async function getResults(
  competitionId: string
): Promise<CompetitionResults> {
  const [pkg, events] = await Promise.all([
    buildCompetitionPackage(competitionId),
    loadEvents(competitionId),
  ]);
  return computeResults(pkg, events);
}
