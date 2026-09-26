import { createClient } from "@/lib/supabase/server";
import type { EventType } from "@/lib/events/event-types";
import {
  createInitialState,
  replay,
} from "@/features/engine";
import type {
  CompetitionPackage,
  EngineEvent,
  LiveState,
} from "@/features/engine/types";

/**
 * Reconstructs the current live state from the append-only event log
 * (spec §35: deterministic reconstruction). Used by the online live UI and by
 * server-side validation. Offline persistence/sync is layered on later.
 */

export async function buildCompetitionPackage(
  competitionId: string
): Promise<CompetitionPackage> {
  const supabase = await createClient();
  const [{ data: teams }, { data: questions }] = await Promise.all([
    supabase
      .from("blackboxquiz_teams")
      .select("id,name,short_name,color,starting_score,display_order")
      .eq("competition_id", competitionId)
      .order("display_order"),
    supabase
      .from("blackboxquiz_questions")
      .select("id,question_number,points,time_limit")
      .eq("competition_id", competitionId)
      .order("question_number"),
  ]);

  return {
    competitionId,
    teams: (teams ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      shortName: (t.short_name as string | null) ?? null,
      color: t.color as string,
      // Seed from the configured starting score; live awards come from events
      // (and are mirrored into teams.current_score by the DB projection).
      currentScore: t.starting_score as number,
    })),
    questions: (questions ?? []).map((q) => ({
      id: q.id as string,
      questionNumber: q.question_number as number,
      points: q.points as number,
      timeLimit: q.time_limit as number,
    })),
    firstTeamId: (teams ?? [])[0]?.id as string | undefined,
  };
}

interface EventRow {
  id: string;
  device_id: string | null;
  sequence_number: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export async function loadEvents(competitionId: string): Promise<EngineEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_competition_events")
    .select("id,device_id,sequence_number,event_type,payload,created_at")
    .eq("competition_id", competitionId)
    .order("sequence_number", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as EventRow[]).map((r) => ({
    event_id: r.id,
    competition_id: competitionId,
    device_id: r.device_id ?? "server",
    sequence_number: r.sequence_number,
    created_at: Date.parse(r.created_at),
    event_type: r.event_type as EventType,
    payload: r.payload ?? {},
  }));
}

export interface MonitorEvent {
  id: string;
  sequence_number: number;
  event_type: string;
  payload: Record<string, unknown>;
  device_id: string | null;
  created_at: string;
}

/**
 * Recent committed events for the admin realtime monitor (spec §28/§797). Server
 * seeded so the monitor is useful even before Supabase Realtime connects; the
 * scoreboard never depends on this.
 */
export async function listRecentEvents(
  competitionId: string,
  limit = 50
): Promise<MonitorEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_competition_events")
    .select(
      "id,sequence_number,event_type,payload,device_id,created_at"
    )
    .eq("competition_id", competitionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as MonitorEvent[]).slice().reverse();
}

/** Current live state = initial package folded with every committed event. */
export async function loadLiveState(
  competitionId: string
): Promise<LiveState> {
  const [pkg, events] = await Promise.all([
    buildCompetitionPackage(competitionId),
    loadEvents(competitionId),
  ]);
  return replay(createInitialState(pkg), events);
}

/**
 * Append a committed event to the server log. The client (offline-first) sends
 * its locally-generated event; sequence/idempotency reconciliation happens in
 * the sync layer. Here we persist as-is for the online live path.
 */
export async function appendCompetitionEvent(
  event: EngineEvent
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("blackboxquiz_competition_events").insert({
    id: event.event_id,
    competition_id: event.competition_id,
    device_id: event.device_id,
    sequence_number: event.sequence_number,
    event_type: event.event_type,
    payload: event.payload,
    created_at: new Date(event.created_at).toISOString(),
  });
  if (error) throw new Error(error.message);
}

export interface IngestResult {
  status: "SYNCED" | "CONFLICT" | "ERROR";
  reason?: string;
}

/**
 * Send a single committed event to the idempotent ingestion RPC (spec §34–§39).
 * Returns SYNCED (stored or already present), CONFLICT (sequence clash recorded
 * server-side, never overwrites history) or ERROR (transient — retry later).
 */
export async function ingestCompetitionEvent(
  event: EngineEvent
): Promise<IngestResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_ingest_event", {
    p_event_id: event.event_id,
    p_competition_id: event.competition_id,
    p_device_id: event.device_id,
    p_sequence_number: event.sequence_number,
    p_event_type: event.event_type,
    p_payload: event.payload,
    p_created_at: new Date(event.created_at).toISOString(),
  });
  if (error) return { status: "ERROR", reason: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { status: string; reason: string | null }
    | undefined;
  const status = row?.status === "CONFLICT" ? "CONFLICT" : "SYNCED";
  return { status, reason: row?.reason ?? undefined };
}
