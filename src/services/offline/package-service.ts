import { createClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";
import { getCompetition } from "@/services/competitions/competition-service";
import { listQuestions } from "@/services/questions/question-service";
import { listPointValues } from "@/services/teams/point-value-service";
import { listTeams } from "@/services/teams/team-service";
import {
  PACKAGE_SCHEMA_VERSION,
  type DownloadablePackage,
  type PackageQuestion,
} from "@/features/offline/package-types";

/**
 * Assembles the complete offline package (spec §30/§31): competition info,
 * teams + initial scores, every question with its options and correct answer,
 * point values/colors, timer settings, branding and permissions. Everything is
 * read under the caller's RLS scope, so only members can download it.
 */
export async function buildFullPackage(
  competitionId: string
): Promise<DownloadablePackage> {
  const competition = await getCompetition(competitionId);
  if (!competition) throw new Error("Competition not found");

  const [questions, pointValues, teams] = await Promise.all([
    listQuestions(competitionId),
    listPointValues(competitionId),
    listTeams(competitionId),
  ]);

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("blackboxquiz_organizations")
    .select("name, logo_url")
    .eq("id", competition.organization_id)
    .maybeSingle<{ name: string; logo_url: string | null }>();

  const packagedQuestions: PackageQuestion[] = questions
    .slice()
    .sort(
      (a, b) =>
        a.display_order - b.display_order ||
        a.question_number - b.question_number
    )
    .map((q) => ({
      id: q.id,
      questionNumber: q.question_number,
      questionText: q.question_text,
      category: q.category,
      difficulty: q.difficulty,
      points: q.points,
      pointColor: q.point_color,
      timeLimit: q.time_limit,
      correctOptionId: q.correct_option_id,
      explanation: q.explanation,
      imageUrl: q.image_url,
      audioUrl: q.audio_url,
      videoUrl: q.video_url,
      status: q.status,
      displayOrder: q.display_order,
      options: q.options.map((o) => ({
        id: o.id,
        questionId: o.question_id,
        optionKey: o.option_key,
        optionText: o.option_text,
        imageUrl: o.image_url,
        displayOrder: o.display_order,
      })),
    }));

  const optionCount = packagedQuestions.reduce(
    (n, q) => n + q.options.length,
    0
  );

  return {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    generatedAt: Date.now(),
    competition: {
      id: competition.id,
      organizationId: competition.organization_id,
      name: competition.name,
      slug: competition.slug,
      description: competition.description,
      timezone: competition.timezone,
      defaultTimeLimit: competition.default_time_limit,
      settings: competition.settings ?? {},
    },
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.short_name,
      color: t.color,
      startingScore: t.starting_score,
      displayOrder: t.display_order,
    })),
    questions: packagedQuestions,
    pointValues: pointValues.map((pv) => ({
      id: pv.id,
      points: pv.points,
      color: pv.color,
      displayOrder: pv.display_order,
    })),
    branding: {
      appName: "BlackBox Quiz",
      footer: `${BRAND.tagline} — ${BRAND.websiteLabel} · ${BRAND.email}`,
      organizationName: org?.name ?? null,
      organizationLogoUrl: org?.logo_url ?? null,
    },
    permissions: ["OPERATE_LIVE"],
    counts: {
      teams: teams.length,
      questions: packagedQuestions.length,
      options: optionCount,
    },
  };
}
