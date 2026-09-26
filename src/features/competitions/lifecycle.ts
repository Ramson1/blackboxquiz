import type { CompetitionStatus } from "@/lib/permissions/roles";

/**
 * Competition lifecycle (spec §11/§12). Mirrors
 * blackboxquiz_allowed_next_status() in the database — the DB remains the
 * authority; this map drives UI affordances only.
 */
export const ALLOWED_TRANSITIONS: Record<CompetitionStatus, CompetitionStatus[]> = {
  DRAFT: ["SETUP"],
  SETUP: ["READY", "DRAFT"],
  READY: ["DOWNLOADING", "SETUP"],
  DOWNLOADING: ["DOWNLOADED", "READY"],
  DOWNLOADED: ["LIVE", "READY"],
  LIVE: ["PAUSED", "COMPLETED"],
  PAUSED: ["LIVE", "COMPLETED"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: [],
  LOCKED: [],
};

export function canTransition(from: CompetitionStatus, to: CompetitionStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: CompetitionStatus): CompetitionStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

/** Human label for badges/buttons. */
export function statusLabel(status: CompetitionStatus): string {
  return status.replaceAll("_", " ");
}
