import { createClient } from "@/lib/supabase/server";
import type { PointValue } from "@/types/database";

/**
 * Point-value configuration (spec §15). Values are never hard-coded in the UI —
 * competition admins configure each value and its color. All writes go through
 * RLS (managers only).
 */

export async function listPointValues(
  competitionId: string
): Promise<PointValue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_point_values")
    .select("*")
    .eq("competition_id", competitionId)
    .order("display_order");
  if (error) throw new Error(error.message);
  return data as PointValue[];
}

export async function createPointValue(input: {
  competitionId: string;
  points: number;
  color: string;
}): Promise<string> {
  const supabase = await createClient();
  const existing = await listPointValues(input.competitionId);
  const { data, error } = await supabase
    .from("blackboxquiz_point_values")
    .insert({
      competition_id: input.competitionId,
      points: input.points,
      color: input.color,
      display_order: existing.length + 1,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) {
    if (error.code === "23505") throw new Error("That point value already exists");
    throw new Error(error.message);
  }
  return data.id;
}

export async function updatePointValue(
  id: string,
  input: { points: number; color: string }
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("blackboxquiz_point_values")
    .update({ points: input.points, color: input.color })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("That point value already exists");
    throw new Error(error.message);
  }
}

export async function deletePointValue(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("blackboxquiz_point_values")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
