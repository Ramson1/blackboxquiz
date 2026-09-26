import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser, effectiveRole } from "@/features/auth/session";
import { getCompetition } from "@/services/competitions/competition-service";
import { listQuestions } from "@/services/questions/question-service";
import { QuestionsManager } from "@/app/competitions/[id]/questions/questions-manager";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Questions" };

export default async function CompetitionQuestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();

  const role = effectiveRole(user);
  const canManage =
    role === "SUPER_ADMIN" || role === "ORGANIZATION_ADMIN";

  const questions = await listQuestions(id);

  return (
    <div className="flex flex-col gap-6">
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
        <h1 className="text-2xl font-bold tracking-tight">Questions</h1>
        <p className="text-sm text-muted-foreground">
          Create, edit, preview and bulk-import the questions for this
          competition.
        </p>
      </div>

      <QuestionsManager
        competitionId={id}
        defaultTimer={competition.default_time_limit}
        canManage={canManage}
        initialQuestions={questions}
      />
    </div>
  );
}
