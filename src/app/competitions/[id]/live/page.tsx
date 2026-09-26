import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser, effectiveRole } from "@/features/auth/session";
import { getCompetition } from "@/services/competitions/competition-service";
import { listQuestions } from "@/services/questions/question-service";
import { listPointValues } from "@/services/teams/point-value-service";
import { loadLiveState } from "@/services/live/live-service";
import type { LiveContentMap } from "@/features/live/types";
import { LiveConsole } from "@/components/live/live-console";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Live console" };

const OPERATOR_ROLES = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "COMPETITION_ADMIN",
  "COMPETITION_OPERATOR",
] as const;

export default async function CompetitionLivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const role = effectiveRole(user);
  if (!role || !OPERATOR_ROLES.includes(role as (typeof OPERATOR_ROLES)[number]))
    redirect("/login?error=unauthorized");

  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();

  const [initialState, questions, pointValues] = await Promise.all([
    loadLiveState(id),
    listQuestions(id),
    listPointValues(id),
  ]);

  const contentMap: LiveContentMap = {};
  for (const q of questions) {
    contentMap[q.id] = {
      id: q.id,
      text: q.question_text,
      options: q.options.map((o) => ({
        id: o.id,
        key: o.option_key,
        text: o.option_text,
      })),
      correctOptionId: q.correct_option_id,
      explanation: q.explanation,
      category: q.category,
    };
  }

  const pointColors: Record<string, string> = {};
  for (const pv of pointValues) pointColors[String(pv.points)] = pv.color;

  const allowBonus =
    (competition.settings as { allow_timeout_bonus?: boolean })
      ?.allow_timeout_bonus !== false;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit text-muted-foreground"
          render={<Link href={`/competitions/${id}`} />}
        >
          <ArrowLeft />
          Back to {competition.name}
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Live console</h1>
        <p className="text-sm text-muted-foreground">
          Run the competition: select questions, manage answers, bonuses, the
          timer and the scoreboard.
        </p>
      </div>

      <LiveConsole
        competitionId={id}
        competitionName={competition.name}
        initialState={initialState}
        contentMap={contentMap}
        pointColors={pointColors}
        allowBonus={allowBonus}
      />
    </div>
  );
}
