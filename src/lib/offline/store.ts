import { offlineDb, type StoredEvent } from "@/lib/offline/db";
import type { DownloadablePackage } from "@/features/offline/package-types";
import type {
  CompetitionPackage,
  EngineEvent,
  LiveState,
} from "@/features/engine/types";
import type { LiveContentMap } from "@/features/live/types";

/**
 * Browser-side persistence for offline operation (spec §29–§33). All reads the
 * offline engine needs come from here; nothing hits the network. Server sync is
 * a separate concern (the sync queue helpers here are drained in Task 14).
 */

export interface CompletenessReport {
  ok: boolean;
  teams: number;
  questions: number;
  options: number;
  issues: string[];
}

/** Persist a freshly downloaded package, replacing any prior copy atomically. */
export async function savePackage(pkg: DownloadablePackage): Promise<void> {
  await offlineDb.packages.put({
    competitionId: pkg.competition.id,
    name: pkg.competition.name,
    schemaVersion: pkg.schemaVersion,
    downloadedAt: Date.now(),
    pkg,
  });
}

export async function getPackage(
  competitionId: string
): Promise<DownloadablePackage | null> {
  const row = await offlineDb.packages.get(competitionId);
  return row?.pkg ?? null;
}

export interface DownloadedSummary {
  id: string;
  name: string;
  downloadedAt: number;
  teams: number;
  questions: number;
}

export async function listDownloaded(): Promise<DownloadedSummary[]> {
  const rows = await offlineDb.packages.toArray();
  return rows
    .map((r) => ({
      id: r.competitionId,
      name: r.name,
      downloadedAt: r.downloadedAt,
      teams: r.pkg.teams.length,
      questions: r.pkg.questions.length,
    }))
    .sort((a, b) => b.downloadedAt - a.downloadedAt);
}

/** Remove a package and all its local events/snapshot. */
export async function deletePackage(competitionId: string): Promise<void> {
  await offlineDb.transaction(
    "rw",
    [offlineDb.packages, offlineDb.events, offlineDb.states],
    async () => {
      await offlineDb.packages.delete(competitionId);
      await offlineDb.events.where("competition_id").equals(competitionId).delete();
      await offlineDb.states.delete(competitionId);
    }
  );
}

// --- Local event log / sync queue -------------------------------------------

export async function appendLocalEvent(event: EngineEvent): Promise<void> {
  const row: StoredEvent = { ...event, synced: false, syncedAt: null };
  await offlineDb.events.put(row);
}

export async function loadLocalEvents(
  competitionId: string
): Promise<EngineEvent[]> {
  const rows = await offlineDb.events
    .where("competition_id")
    .equals(competitionId)
    .sortBy("sequence_number");
  return rows.map(toEngineEvent);
}

export async function getUnsyncedEvents(
  competitionId: string
): Promise<EngineEvent[]> {
  const rows = await offlineDb.events
    .where("competition_id")
    .equals(competitionId)
    .filter((r) => !r.synced)
    .sortBy("sequence_number");
  return rows.map(toEngineEvent);
}

export async function countUnsynced(competitionId: string): Promise<number> {
  return offlineDb.events
    .where("competition_id")
    .equals(competitionId)
    .filter((r) => !r.synced)
    .count();
}

export async function markEventsSynced(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const now = Date.now();
  const rows = await offlineDb.events.bulkGet(eventIds);
  const updates = rows
    .filter((r): r is StoredEvent => Boolean(r))
    .map((r) => ({ ...r, synced: true, syncedAt: now }));
  await offlineDb.events.bulkPut(updates);
}

/** Events still awaiting sync (excludes conflicted ones — those need admin action). */
export async function getPendingEvents(
  competitionId: string
): Promise<EngineEvent[]> {
  const rows = await offlineDb.events
    .where("competition_id")
    .equals(competitionId)
    .filter((r) => !r.synced && !r.conflict)
    .sortBy("sequence_number");
  return rows.map(toEngineEvent);
}

export async function countPending(competitionId: string): Promise<number> {
  return offlineDb.events
    .where("competition_id")
    .equals(competitionId)
    .filter((r) => !r.synced && !r.conflict)
    .count();
}

export async function countConflicts(competitionId: string): Promise<number> {
  return offlineDb.events
    .where("competition_id")
    .equals(competitionId)
    .filter((r) => Boolean(r.conflict))
    .count();
}

/** Flag an event as a server-side conflict so the queue stops retrying it (§39). */
export async function markEventConflict(
  eventId: string,
  reason: string
): Promise<void> {
  const row = await offlineDb.events.get(eventId);
  if (row) await offlineDb.events.put({ ...row, conflict: true, lastError: reason });
}

function toEngineEvent(row: StoredEvent): EngineEvent {
  return {
    event_id: row.event_id,
    competition_id: row.competition_id,
    device_id: row.device_id,
    sequence_number: row.sequence_number,
    created_at: row.created_at,
    event_type: row.event_type,
    payload: row.payload,
  };
}

// --- Materialized snapshot (§33) --------------------------------------------

export async function saveSnapshot(state: LiveState): Promise<void> {
  await offlineDb.states.put({
    competitionId: state.competitionId,
    status: state.status,
    lastEventSequence: state.lastEventSequence,
    updatedAt: Date.now(),
    snapshot: state,
  });
}

export async function getSnapshot(
  competitionId: string
): Promise<LiveState | null> {
  const row = await offlineDb.states.get(competitionId);
  return row?.snapshot ?? null;
}

// --- Package → engine/content projections -----------------------------------

export function toEnginePackage(pkg: DownloadablePackage): CompetitionPackage {
  const teams = [...pkg.teams].sort((a, b) => a.displayOrder - b.displayOrder);
  return {
    competitionId: pkg.competition.id,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      color: t.color,
      // Seed from the configured starting score; live awards come from events.
      currentScore: t.startingScore,
    })),
    questions: pkg.questions.map((q) => ({
      id: q.id,
      questionNumber: q.questionNumber,
      points: q.points,
      timeLimit: q.timeLimit,
    })),
    firstTeamId: teams[0]?.id,
  };
}

export function toContentMap(pkg: DownloadablePackage): LiveContentMap {
  const map: LiveContentMap = {};
  for (const q of pkg.questions) {
    map[q.id] = {
      id: q.id,
      text: q.questionText,
      options: q.options.map((o) => ({
        id: o.id,
        key: o.optionKey,
        text: o.optionText,
      })),
      correctOptionId: q.correctOptionId,
      explanation: q.explanation,
      category: q.category,
    };
  }
  return map;
}

export function toPointColors(
  pkg: DownloadablePackage
): Record<string, string> {
  const m: Record<string, string> = {};
  for (const pv of pkg.pointValues) m[String(pv.points)] = pv.color;
  return m;
}

/** Verify the local package is complete before allowing offline start (§31). */
export function checkCompleteness(
  pkg: DownloadablePackage | null
): CompletenessReport {
  if (!pkg) {
    return {
      ok: false,
      teams: 0,
      questions: 0,
      options: 0,
      issues: ["Competition has not been downloaded for offline use"],
    };
  }
  const issues: string[] = [];
  const teams = pkg.teams.length;
  const questions = pkg.questions.length;
  const options = pkg.questions.reduce((n, q) => n + q.options.length, 0);

  if (!pkg.competition?.id) issues.push("Missing competition information");
  if (teams !== 2) issues.push(`Exactly 2 teams required (found ${teams})`);
  if (questions < 1) issues.push("No questions downloaded");
  if (pkg.pointValues.length < 1) issues.push("No point values configured");

  const thinOptions = pkg.questions.find((q) => q.options.length < 2);
  if (thinOptions)
    issues.push(`Q${thinOptions.questionNumber} has fewer than 2 options`);

  const badAnswer = pkg.questions.find(
    (q) => !q.correctOptionId || !q.options.some((o) => o.id === q.correctOptionId)
  );
  if (badAnswer)
    issues.push(`Q${badAnswer.questionNumber} is missing a valid correct answer`);

  return { ok: issues.length === 0, teams, questions, options, issues };
}
