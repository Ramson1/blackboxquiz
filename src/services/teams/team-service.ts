import { createClient } from "@/lib/supabase/server";
import type { Team } from "@/types/database";

/**
 * Team data access (spec §13). Exactly two teams per competition — the
 * blackboxquiz_enforce_team_limit trigger rejects a third insert server-side.
 * All writes are authorized by RLS (managers only).
 */

export async function listTeams(competitionId: string): Promise<Team[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_teams")
    .select("*")
    .eq("competition_id", competitionId)
    .order("display_order");
  if (error) throw new Error(error.message);
  return data as Team[];
}

/** Pre-live statuses where editing a starting score also resets the live score. */
const PRE_LIVE_STATUSES = new Set([
  "DRAFT",
  "SETUP",
  "READY",
  "DOWNLOADING",
  "DOWNLOADED",
]);

async function isPreLive(competitionId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blackboxquiz_competitions")
    .select("status")
    .eq("id", competitionId)
    .maybeSingle<{ status: string }>();
  return PRE_LIVE_STATUSES.has(data?.status ?? "");
}

export async function createTeam(input: {
  competitionId: string;
  name: string;
  shortName?: string;
  color: string;
  startingScore: number;
}): Promise<string> {
  const supabase = await createClient();
  const existing = await listTeams(input.competitionId);
  const { data, error } = await supabase
    .from("blackboxquiz_teams")
    .insert({
      competition_id: input.competitionId,
      name: input.name.trim(),
      short_name: input.shortName?.trim() || null,
      color: input.color,
      starting_score: input.startingScore,
      current_score: input.startingScore,
      display_order: existing.length + 1,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateTeam(
  teamId: string,
  input: {
    name: string;
    shortName?: string;
    color: string;
    startingScore: number;
  }
): Promise<void> {
  const supabase = await createClient();
  const team = await getTeam(teamId);
  if (!team) throw new Error("Team not found");

  const patch: Record<string, unknown> = {
    name: input.name.trim(),
    short_name: input.shortName?.trim() || null,
    color: input.color,
    starting_score: input.startingScore,
  };
  // Only clobber the live score while the competition is still pre-live.
  if ((await isPreLive(team.competition_id)) && team.starting_score !== input.startingScore) {
    patch.current_score = input.startingScore;
  }

  const { error } = await supabase
    .from("blackboxquiz_teams")
    .update(patch)
    .eq("id", teamId);
  if (error) throw new Error(error.message);
}

export async function deleteTeam(teamId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("blackboxquiz_teams")
    .delete()
    .eq("id", teamId);
  if (error) throw new Error(error.message);
}

async function getTeam(teamId: string): Promise<Team | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blackboxquiz_teams")
    .select("*")
    .eq("id", teamId)
    .maybeSingle<Team>();
  return data;
}
