import { createClient } from "@/lib/supabase/server";

/**
 * Emergency lock (spec §102). Super Admin only — enforced inside the RPC — this
 * prevents the connected competition device from continuing once the command is
 * received, and records an audit entry.
 */
export async function emergencyLock(
  competitionId: string,
  reason: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("blackboxquiz_emergency_lock", {
    p_competition_id: competitionId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}
