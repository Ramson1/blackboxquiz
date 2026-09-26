"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { EVENT_TYPES } from "@/lib/events/event-types";
import { ingestCompetitionEvent } from "@/services/live/live-service";
import type { EngineEvent } from "@/features/engine/types";

/**
 * Syncs a committed live-engine event to the server via the idempotent
 * ingestion RPC (spec §34–§39). Authorization is enforced inside the RPC
 * (`blackboxquiz_is_competition_member`). The live UI applies every event
 * locally first and then records it here, so the competition never waits on the
 * network; transient failures are retried by the sync queue.
 */
const eventSchema = z.object({
  event_id: z.uuid(),
  competition_id: z.uuid(),
  device_id: z.string().min(1).max(200),
  sequence_number: z.number().int().nonnegative(),
  created_at: z.number().int().positive(),
  event_type: z.enum(EVENT_TYPES),
  payload: z.record(z.string(), z.unknown()),
});

export type SyncEventResult =
  | { status: "SYNCED" }
  | { status: "CONFLICT"; reason: string }
  | { status: "ERROR"; error: string };

export async function syncLiveEventAction(
  event: EngineEvent
): Promise<SyncEventResult> {
  await requireUser();
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success) {
    return { status: "ERROR", error: parsed.error.issues[0].message };
  }
  const res = await ingestCompetitionEvent(parsed.data as EngineEvent);
  if (res.status === "CONFLICT") {
    return { status: "CONFLICT", reason: res.reason ?? "Sync conflict" };
  }
  if (res.status === "ERROR") {
    return { status: "ERROR", error: res.reason ?? "Could not sync event." };
  }
  return { status: "SYNCED" };
}
