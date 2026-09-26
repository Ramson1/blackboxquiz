import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompetition } from "@/services/competitions/competition-service";
import { loadLiveState } from "@/services/live/live-service";
import { requireUser } from "@/features/auth/session";
import { Scoreboard } from "@/components/live/scoreboard";
import { AudienceBoard } from "@/components/live/audience-board";
import { BrandFooter } from "@/components/brand";
import { pointColorFor } from "@/lib/validation/questions";

export const metadata: Metadata = { title: "Scoreboard" };

/**
 * Read-only scoreboard (spec §28). Same persistent board used as the audience
 * display and the admin live monitor. Derived from replaying the event log so it
 * always matches the authoritative live state.
 */
export default async function CompetitionScoreboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();

  const state = await loadLiveState(id);
  const activeQuestion = state.active
    ? state.questions.find((q) => q.id === state.active?.questionId)
    : null;

  return (
    <AudienceBoard>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="rounded-2xl border bg-card p-6">
          <Scoreboard
            competitionName={competition.name}
            teams={state.teams}
            currentTeamId={state.currentTeamId}
            status={state.status}
            locked={state.locked}
          />
        </div>

        {state.active && activeQuestion ? (
          <div className="flex items-center justify-between rounded-2xl border-2 bg-card p-5">
            <div className="flex items-center gap-4">
              <span
                className="inline-flex items-center rounded-lg px-3 py-1.5 text-lg font-black text-white"
                style={{
                  backgroundColor:
                    activeQuestion
                      ? pointColorFor(activeQuestion.points)
                      : undefined,
                }}
              >
                {activeQuestion.points.toLocaleString()}
              </span>
              <div>
                <p className="text-sm uppercase tracking-wide text-muted-foreground">
                  Now on stage
                </p>
                <p className="text-xl font-bold">
                  Question {activeQuestion.questionNumber}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
              {state.active.phase.replaceAll("_", " ")}
            </span>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {state.status === "IDLE"
              ? "The competition has not started yet."
              : state.status === "COMPLETED"
                ? "Competition complete — see the results."
                : "Waiting for the next question…"}
          </p>
        )}

        <BrandFooter />
      </div>
    </AudienceBoard>
  );
}
