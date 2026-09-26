/**
 * Downloadable competition package (spec §30). Everything the offline client
 * needs to run a competition without a network connection, assembled by
 * src/services/offline/package-service.ts and persisted to IndexedDB (Dexie).
 * These types are client-safe (shared by server builder and browser store).
 */

export const PACKAGE_SCHEMA_VERSION = 1;

export interface PackageOption {
  id: string;
  questionId: string;
  optionKey: string;
  optionText: string;
  imageUrl: string | null;
  displayOrder: number;
}

export interface PackageQuestion {
  id: string;
  questionNumber: number;
  questionText: string;
  category: string | null;
  difficulty: string | null;
  points: number;
  pointColor: string;
  timeLimit: number;
  correctOptionId: string | null;
  explanation: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  status: string;
  displayOrder: number;
  options: PackageOption[];
}

export interface PackageTeam {
  id: string;
  name: string;
  shortName: string | null;
  color: string;
  startingScore: number;
  displayOrder: number;
}

export interface PackagePointValue {
  id: string;
  points: number;
  color: string;
  displayOrder: number;
}

export interface PackageCompetition {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  timezone: string;
  defaultTimeLimit: number;
  settings: Record<string, unknown>;
}

export interface PackageBranding {
  appName: string;
  footer: string;
  organizationName: string | null;
  organizationLogoUrl: string | null;
}

export interface DownloadablePackage {
  schemaVersion: number;
  generatedAt: number; // epoch ms
  competition: PackageCompetition;
  teams: PackageTeam[];
  questions: PackageQuestion[];
  pointValues: PackagePointValue[];
  branding: PackageBranding;
  permissions: string[];
  counts: { teams: number; questions: number; options: number };
}
