import { createClient } from "@/lib/supabase/server";
import type { ScoreAdjustment } from "@/types/database";

/**
 * Manual score adjustment (spec §56, §101). Manager scope is enforced inside
 * the RPC; the adjustment is recorded as an event so history stays
 * reconstructable (§108) and the scoreboard projection updates automatically.
 */

export interface AdjustmentResult {
  adjustmentId: string;
  previousScore: number;
  adjustment: number;
  newScore: number;
}

export async function adjustScore(input: {
  teamId: string;
  adjustment: number;
  reason: string;
}): Promise<AdjustmentResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_adjust_score", {
    p_team_id: input.teamId,
    p_adjustment: input.adjustment,
    p_reason: input.reason,
  });
  if (error) throw new Error(error.message);
  return data as AdjustmentResult;
}

export async function listScoreAdjustments(
  competitionId: string
): Promise<ScoreAdjustment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_score_adjustments")
    .select("*")
    .eq("competition_id", competitionId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as ScoreAdjustment[];
}
