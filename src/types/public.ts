/**
 * Shared shapes for the public competition flow (migration 0012):
 * - the run bundle returned by `blackboxquiz_public_start` (a full
 *   DownloadablePackage + replayable event log + rules-screen data),
 * - the payload the setup wizard submits to
 *   `blackboxquiz_public_complete_setup`.
 * Client-safe: imported by server actions and browser components alike.
 */

import type { DownloadablePackage } from "@/features/offline/package-types";
import type { EngineEvent } from "@/features/engine/types";

export interface PublicRulesInfo {
  teamNames: string[];
  colors: string[];
  questionCount: number;
  timePerQuestion: number;
  pointTiers: number[];
  bonusEnabled: boolean;
}

/** What `blackboxquiz_public_start` returns (jsonb, camelCase bundle). */
export interface PublicBundle {
  bundle: DownloadablePackage;
  events: EngineEvent[];
  rules: PublicRulesInfo;
}

/** A single question as submitted by the public setup wizard. Mirrors the
 * shape `blackboxquiz_validate_question_payload` expects (0006). */
export interface PublicSetupQuestion {
  question_text: string;
  category?: string;
  difficulty?: string;
  points: number;
  point_color?: string;
  time_limit?: number;
  explanation?: string;
  correct_key: string;
  options: { key: string; text: string; display_order?: number }[];
}

/** Args for `blackboxquiz_public_complete_setup`. */
export interface PublicSetupSubmission {
  token: string;
  password: string;
  title: string;
  teamOne: string;
  teamTwo: string;
  timePerQuestion: number;
  questions: PublicSetupQuestion[];
}
