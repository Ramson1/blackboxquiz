import type { AppRole, CompetitionStatus, QuestionStatus } from "@/lib/permissions/roles";

/**
 * Row types mirroring supabase/migrations/0001_initial_schema.sql.
 * All tables carry the blackboxquiz_ prefix in the database;
 * TS interfaces are named after the table without the prefix noise.
 * Run `supabase gen types typescript` during hardening to replace these
 * with the generated Database<> type.
 */

export type OrganizationStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: AppRole;
  status: "ACTIVE" | "DISABLED";
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: Exclude<AppRole, "SUPER_ADMIN">;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  created_at: string;
  updated_at: string;
}

export interface Competition {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: CompetitionStatus;
  scheduled_at: string | null;
  timezone: string;
  default_time_limit: number;
  current_team_id: string | null;
  current_question_id: string | null;
  settings: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Team {
  id: string;
  competition_id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  color: string;
  starting_score: number;
  current_score: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface PointValue {
  id: string;
  competition_id: string;
  points: number;
  color: string;
  display_order: number;
  created_at: string;
}

export interface Question {
  id: string;
  competition_id: string;
  question_number: number;
  question_text: string;
  category: string | null;
  difficulty: string | null;
  points: number;
  point_color: string;
  time_limit: number;
  correct_option_id: string | null;
  explanation: string | null;
  image_url: string | null;
  audio_url: string | null;
  video_url: string | null;
  status: QuestionStatus;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface QuestionOption {
  id: string;
  question_id: string;
  option_key: string;
  option_text: string;
  image_url: string | null;
  display_order: number;
  created_at: string;
}

export interface QuestionAttempt {
  id: string;
  competition_id: string;
  question_id: string;
  team_id: string;
  attempt_type: "PRIMARY" | "BONUS";
  selected_option_id: string | null;
  result: "CORRECT" | "WRONG" | "TIMEOUT" | null;
  points_awarded: number;
  started_at: string;
  submitted_at: string | null;
  created_at: string;
}

export interface CompetitionEventRow {
  id: string;
  competition_id: string;
  device_id: string | null;
  sequence_number: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CompetitionDevice {
  id: string;
  competition_id: string;
  device_identifier: string;
  device_name: string | null;
  status: "PENDING" | "AUTHORIZED" | "REVOKED";
  authorized_by: string | null;
  authorized_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface AccessCode {
  id: string;
  competition_id: string;
  code_hash: string;
  code_prefix: string;
  permissions: string[];
  expires_at: string | null;
  max_uses: number | null;
  usage_count: number;
  status: "ACTIVE" | "EXHAUSTED" | "REVOKED" | "EXPIRED";
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** Admin-issued public setup invite (migration 0012). The bcrypt hash and
 * token are never both exposed; lists use this safe projection. */
export interface SetupInvite {
  id: string;
  organization_id: string;
  token: string;
  label: string | null;
  competition_id: string | null;
  status: "ACTIVE" | "USED" | "REVOKED";
  expires_at: string | null;
  created_by: string | null;
  used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncRecord {
  id: string;
  competition_id: string;
  device_id: string | null;
  event_id: string;
  sequence_number: number;
  status: "PENDING" | "SYNCED" | "FAILED" | "CONFLICT";
  error: string | null;
  synced_at: string | null;
  created_at: string;
}

export interface ScoreAdjustment {
  id: string;
  competition_id: string;
  team_id: string;
  previous_score: number;
  adjustment: number;
  new_score: number;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  organization_id: string | null;
  competition_id: string | null;
  user_id: string | null;
  device_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export interface CompetitionLock {
  id: string;
  competition_id: string;
  locked: boolean;
  reason: string | null;
  locked_by: string | null;
  created_at: string;
  released_at: string | null;
}
