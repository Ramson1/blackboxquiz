"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import {
  createTeam,
  deleteTeam,
  updateTeam,
} from "@/services/teams/team-service";
import {
  createPointValue,
  deletePointValue,
  updatePointValue,
} from "@/services/teams/point-value-service";

export type TeamActionResult = { ok: true; id?: string } | { ok: false; error: string };

const hexColor = /^#[0-9a-fA-F]{6}$/;

const teamSchema = z.object({
  competitionId: z.uuid(),
  teamId: z.uuid().optional(),
  name: z.string().trim().min(1, "Team name is required").max(80),
  shortName: z.string().trim().max(12).optional(),
  color: z.string().regex(hexColor, "Pick a valid color"),
  startingScore: z.coerce.number().int().min(0, "Cannot be negative").max(1_000_000),
});

function revalidate(competitionId: string) {
  revalidatePath(`/competitions/${competitionId}/teams`);
  revalidatePath(`/competitions/${competitionId}`);
}

export async function saveTeamAction(
  input: unknown
): Promise<TeamActionResult> {
  await requireUser();
  const parsed = teamSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { competitionId, teamId, name, shortName, color, startingScore } =
    parsed.data;
  try {
    if (teamId) {
      await updateTeam(teamId, { name, shortName, color, startingScore });
      revalidate(competitionId);
      return { ok: true, id: teamId };
    }
    const id = await createTeam({
      competitionId,
      name,
      shortName,
      color,
      startingScore,
    });
    revalidate(competitionId);
    return { ok: true, id };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Could not save team (a competition has exactly two teams).",
    };
  }
}

export async function deleteTeamAction(input: {
  competitionId: string;
  teamId: string;
}): Promise<TeamActionResult> {
  await requireUser();
  const { competitionId, teamId } = z
    .object({ competitionId: z.uuid(), teamId: z.uuid() })
    .parse(input);
  try {
    await deleteTeam(teamId);
    revalidate(competitionId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete team.",
    };
  }
}

const pointSchema = z.object({
  competitionId: z.uuid(),
  id: z.uuid().optional(),
  points: z.coerce.number().int().positive("Points must be positive"),
  color: z.string().regex(hexColor, "Pick a valid color"),
});

export async function savePointValueAction(
  input: unknown
): Promise<TeamActionResult> {
  await requireUser();
  const parsed = pointSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { competitionId, id, points, color } = parsed.data;
  try {
    if (id) {
      await updatePointValue(id, { points, color });
    } else {
      await createPointValue({ competitionId, points, color });
    }
    revalidate(competitionId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not save point value.",
    };
  }
}

export async function deletePointValueAction(input: {
  competitionId: string;
  id: string;
}): Promise<TeamActionResult> {
  await requireUser();
  const { competitionId, id } = z
    .object({ competitionId: z.uuid(), id: z.uuid() })
    .parse(input);
  try {
    await deletePointValue(id);
    revalidate(competitionId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete point value.",
    };
  }
}
