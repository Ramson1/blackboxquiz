/** Competition event types (spec §34, §110). Append-only event log. */
export const EVENT_TYPES = [
  "COMPETITION_CREATED",
  "COMPETITION_READY",
  "COMPETITION_DOWNLOADED",
  "COMPETITION_STARTED",
  "COMPETITION_PAUSED",
  "COMPETITION_RESUMED",
  "COMPETITION_LOCKED",
  "COMPETITION_UNLOCKED",
  "QUESTION_SELECTED",
  "QUESTION_STARTED",
  "ANSWER_SUBMITTED",
  "ANSWER_CORRECT",
  "ANSWER_WRONG",
  "QUESTION_TIMEOUT",
  "BONUS_STARTED",
  "BONUS_ANSWER_SUBMITTED",
  "BONUS_CORRECT",
  "BONUS_WRONG",
  "ANSWER_REVEALED",
  "QUESTION_COMPLETED",
  "SCORE_ADJUSTED",
  "COMPETITION_COMPLETED",
  "SYNC_STARTED",
  "SYNC_COMPLETED",
  "SYNC_FAILED",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** Shape of every queued/committed sync event (spec §34). */
export type CompetitionEvent = {
  event_id: string;
  competition_id: string;
  device_id: string;
  sequence_number: number;
  event_type: EventType;
  payload: Record<string, unknown>;
  created_at: string;
};
