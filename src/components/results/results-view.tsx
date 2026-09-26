import { Trophy } from "lucide-react";
import type {
  CompetitionResults,
  QuestionResult,
  TeamResultStats,
} from "@/features/results/types";
import { pointColorFor } from "@/lib/validation/questions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Results dashboard (spec §58, §59, §83, §84). Presentational and shared by the
 * results page, the end-of-competition screen and the exporters. Draws a winner
 * only when one team clearly finished ahead; ties are shown as a DRAW.
 */
export function ResultsView({
  results,
  competitionName,
}: {
  results: CompetitionResults;
  competitionName: string;
}) {
  const [first, second] = orderTeams(results.teams);
  const hasWinner =
    results.status === "COMPLETED" &&
    first &&
    second &&
    first.finalScore !== second.finalScore &&
    results.teams.length === 2;

  return (
    <div className="flex flex-col gap-6">
      <Card className={hasWinner ? "border-primary/40" : undefined}>
        <CardContent className="flex flex-col items-center gap-5 py-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {results.status === "COMPLETED"
              ? "Competition complete"
              : "Live standings"}
          </p>
          <h2 className="text-3xl font-black">{competitionName}</h2>

          {hasWinner && first ? (
            <p
              className="flex items-center gap-2 text-xl font-bold"
              style={{ color: first.color }}
            >
              <Trophy className="size-6" /> {first.name} win with{" "}
              {first.finalScore.toLocaleString()}
            </p>
          ) : results.isDraw ? (
            <p className="text-xl font-bold text-muted-foreground">DRAW</p>
          ) : null}

          <div className="flex w-full flex-wrap items-stretch justify-center gap-4">
            {results.teams.map((t) => (
              <FinalScoreCard key={t.teamId} team={t} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team statistics</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Metric</th>
                {results.teams.map((t) => (
                  <th
                    key={t.teamId}
                    className="py-2 px-4 text-right font-bold tabular-nums"
                    style={{ color: t.color }}
                  >
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Final score", (t: TeamResultStats) => t.finalScore],
                  ["Starting score", (t: TeamResultStats) => t.startingScore],
                  ["Points gained", (t: TeamResultStats) => t.pointsGained],
                  ["Questions selected", (t: TeamResultStats) => t.questionsSelected],
                  ["Correct answers", (t: TeamResultStats) => t.correct],
                  ["Wrong answers", (t: TeamResultStats) => t.wrong],
                  ["Timeouts", (t: TeamResultStats) => t.timeouts],
                  ["Bonus opportunities", (t: TeamResultStats) => t.bonusReceived],
                  ["Bonus correct", (t: TeamResultStats) => t.bonusCorrect],
                  ["Bonus wrong", (t: TeamResultStats) => t.bonusWrong],
                  ["Questions attempted", (t: TeamResultStats) => t.attempted],
                  ["Manual adjustments", (t: TeamResultStats) => t.adjustments],
                ] as const
              ).map(([label, get]) => (
                <tr key={label} className="border-b last:border-0">
                  <td className="py-2 pr-4 text-muted-foreground">{label}</td>
                  {results.teams.map((t) => (
                    <td
                      key={t.teamId}
                      className="py-2 px-4 text-right font-semibold tabular-nums"
                    >
                      {Number(get(t)).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <QuestionResults results={results} />
    </div>
  );
}

function FinalScoreCard({ team }: { team: TeamResultStats }) {
  return (
    <div
      className="flex min-w-48 flex-1 flex-col items-center gap-1 rounded-2xl border-2 p-6"
      style={{ borderColor: team.color }}
    >
      <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {team.name}
      </span>
      <span
        className="text-4xl font-black tabular-nums"
        style={{ color: team.color }}
      >
        {team.finalScore.toLocaleString()}
      </span>
    </div>
  );
}

function QuestionResults({ results }: { results: CompetitionResults }) {
  const teamById = new Map(results.teams.map((t) => [t.teamId, t]));
  const name = (id: string | null) =>
    (id && teamById.get(id)?.name) || "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Question-by-question results ({results.attemptedQuestions}/
          {results.totalQuestions} attempted)
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {results.questions.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No questions have been played yet.
          </p>
        )}
        {results.questions.map((q) => (
          <QuestionRow key={q.questionId} q={q} teamName={name} />
        ))}
      </CardContent>
    </Card>
  );
}

function QuestionRow({
  q,
  teamName,
}: {
  q: QuestionResult;
  teamName: (id: string | null) => string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center rounded-md px-2 py-1 text-xs font-bold text-white"
          style={{ backgroundColor: pointColorFor(q.points) }}
        >
          {q.points.toLocaleString()}
        </span>
        <span className="font-semibold">Question {q.questionNumber}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
        <span>
          Primary: <span className="font-medium text-foreground">{teamName(q.primaryTeamId)}</span>{" "}
          <OutcomeBadge outcome={q.primaryResult} />
        </span>
        {q.bonusTeamId && (
          <span>
            Bonus: <span className="font-medium text-foreground">{teamName(q.bonusTeamId)}</span>{" "}
            <OutcomeBadge outcome={q.bonusResult} />
          </span>
        )}
        <span>
          Points:{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {q.pointsAwarded.toLocaleString()}
          </span>
          {q.awardedTeamId ? ` → ${teamName(q.awardedTeamId)}` : ""}
        </span>
      </div>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: QuestionResult["primaryResult"] }) {
  const map: Record<string, string> = {
    CORRECT: "bg-emerald-500 text-white",
    WRONG: "bg-red-600 text-white",
    TIMEOUT: "bg-amber-500 text-white",
    NONE: "bg-muted text-muted-foreground",
  };
  return (
    <Badge className={map[outcome]} variant="secondary">
      {outcome === "NONE" ? "not answered" : outcome.toLowerCase()}
    </Badge>
  );
}

function orderTeams(teams: TeamResultStats[]): TeamResultStats[] {
  return [...teams].sort((a, b) => b.finalScore - a.finalScore);
}
