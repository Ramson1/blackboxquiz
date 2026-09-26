"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { buildFullPackage } from "@/services/offline/package-service";
import type { DownloadablePackage } from "@/features/offline/package-types";

export type PackageResult =
  | { ok: true; pkg: DownloadablePackage }
  | { ok: false; error: string };

/**
 * Returns the full offline package for a competition (spec §30). Runs under the
 * caller's RLS scope, so only competition members can download it. The browser
 * persists the result into IndexedDB (Dexie) for offline operation.
 */
export async function downloadCompetitionPackageAction(
  competitionId: string
): Promise<PackageResult> {
  await requireUser();
  const parsed = z.uuid().safeParse(competitionId);
  if (!parsed.success) return { ok: false, error: "Invalid competition id." };
  try {
    const pkg = await buildFullPackage(parsed.data);
    return { ok: true, pkg };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not package competition.",
    };
  }
}
