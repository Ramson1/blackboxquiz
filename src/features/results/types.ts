/**
 * Results model (spec §58, §59, §83, §84, §108). Derived entirely from the
 * append-only event log so results are always reconstructable and never depend
 * on mutable scoreboard rows alone.
 */

export interface TeamResultStats {
  teamId: string;
  name: string;
  shortName: string | null;
  color: string;
  startingScore: number;
  /** startingScore + pointsGained + net adjustments. */
  finalScore: number;
  questionsSelected: number;
  correct: number;
  wrong: number;
  timeouts: number;
  bonusReceived: number;
  bonusCorrect: number;
  bonusWrong: number;
  /** Net manual score adjustments (§56) applied to this team. */
  adjustments: number;
  pointsGained: number;
  attempted: number;
}

export type AttemptOutcome = "CORRECT" | "WRONG" | "TIMEOUT" | "NONE";

export interface QuestionResult {
  questionId: string;
  questionNumber: number;
  points: number;
  primaryTeamId: string | null;
  primaryResult: AttemptOutcome;
  bonusTeamId: string | null;
  bonusResult: AttemptOutcome;
  awardedTeamId: string | null;
  pointsAwarded: number;
}

export type ResultsStatus = "IDLE" | "LIVE" | "PAUSED" | "COMPLETED";

export interface CompetitionResults {
  competitionId: string;
  status: ResultsStatus;
  teams: TeamResultStats[];
  questions: QuestionResult[];
  totalQuestions: number;
  attemptedQuestions: number;
  /** True when the competition ran and both teams finished level (§83/§84). */
  isDraw: boolean;
}
