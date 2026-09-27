/** Application roles (spec §6). Enforced server-side via RLS + service checks. */
export const APP_ROLES = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "COMPETITION_ADMIN",
  "COMPETITION_OPERATOR",
  "VIEWER",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Roles assignable within an organization (matches members CHECK constraint). */
export const ORG_MEMBER_ROLES = [
  "ORGANIZATION_ADMIN",
  "COMPETITION_ADMIN",
  "COMPETITION_OPERATOR",
  "VIEWER",
] as const;

export type OrgMemberRole = (typeof ORG_MEMBER_ROLES)[number];

/** Fine-grained permissions grantable through competition access codes (spec §9). */
export const ACCESS_PERMISSIONS = [
  "UPLOAD_QUESTIONS",
  "EDIT_QUESTIONS",
  "VIEW_RESULTS",
  "EXPORT_RESULTS",
  "MANAGE_TEAMS",
  "MANAGE_SETTINGS",
] as const;

export type AccessPermission = (typeof ACCESS_PERMISSIONS)[number];

/** Human-readable labels for access-code permissions (spec §9, §99). */
export const PERMISSION_LABELS: Record<AccessPermission, string> = {
  UPLOAD_QUESTIONS: "Question upload",
  EDIT_QUESTIONS: "Question editing",
  VIEW_RESULTS: "View results",
  EXPORT_RESULTS: "Export results",
  MANAGE_TEAMS: "Manage teams",
  MANAGE_SETTINGS: "Manage settings",
};

/** Competition lifecycle states (spec §11). */
export const COMPETITION_STATUSES = [
  "DRAFT",
  "SETUP",
  "READY",
  "DOWNLOADING",
  "DOWNLOADED",
  "LIVE",
  "PAUSED",
  "COMPLETED",
  "ARCHIVED",
  "LOCKED",
] as const;

export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];

/** Question states (spec §16). */
export const QUESTION_STATUSES = [
  "AVAILABLE",
  "SELECTED",
  "ANSWERING",
  "FAILED",
  "BONUS_AVAILABLE",
  "BONUS_ANSWERING",
  "ANSWERED",
  "COMPLETED",
] as const;

export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
