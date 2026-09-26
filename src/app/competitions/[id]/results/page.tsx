import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";
import { BrandFooter } from "@/components/brand";
import { BRAND } from "@/lib/brand";
import { requireUser } from "@/features/auth/session";
import {
  getCompetition,
  getOrganizationName,
} from "@/services/competitions/competition-service";
import { getResults } from "@/services/results/results-service";
import { ResultsView } from "@/components/results/results-view";
import { ExportButtons } from "@/components/results/export-buttons";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Results" };

/**
 * Results dashboard (spec §58, §59, §83, §84). Reconstructed from the event log,
 * so it is correct whether the competition is mid-flight or completed.
 */
export default async function CompetitionResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const competition = await getCompetition(id);
  if (!competition) notFound();

  const results = await getResults(id);
  const organizationName =
    (await getOrganizationName(competition.organization_id)) ?? "BlackBox Quiz";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit text-muted-foreground print:hidden"
          render={<Link href={`/competitions/${id}`} />}
        >
          <ArrowLeft />
          Back to {competition.name}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Trophy className="size-5 text-amber-500" /> Results
          </h1>
          <ExportButtons
            results={results}
            competitionName={competition.name}
            organizationName={organizationName}
          />
        </div>
        <p className="hidden text-sm text-muted-foreground print:block">
          {organizationName} — {BRAND.tagline} · {BRAND.websiteLabel} ·{" "}
          {BRAND.email}
        </p>
      </div>

      <ResultsView results={results} competitionName={competition.name} />

      <BrandFooter />
    </div>
  );
}
