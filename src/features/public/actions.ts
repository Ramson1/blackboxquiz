"use server";

import { z } from "zod";
import { clientRateKey, rateLimit } from "@/lib/security/rate-limit";
import type { EngineEvent } from "@/features/engine/types";
import {
  publicCheckSetup,
  publicCompleteSetup,
  publicRecordEvents,
  publicStart,
} from "@/services/public/public-service";
import type { PublicBundle } from "@/types/public";

/**
 * Public competition actions (migration 0012). Deliberately NOT gated by
 * requireUser — the invite token + bcrypt password ARE the authorization, and
 * the SECURITY DEFINER RPCs verify them (and lock the invite after repeated
 * failures). The in-memory limiter here adds a second layer so a single
 * client cannot hammer bcrypt; actions never throw to the client.
 */

export type PublicActionResult = { ok: true } | { ok: false; error: string };
export type PublicCheckResult =
  | { ok: true; organizationName: string | null }
  | { ok: false; error: string };
export type PublicStartResult =
  | { ok: true; bundle: PublicBundle }
  | { ok: false; error: string };
export type PublicRecordResult =
  | { ok: true; lastSequence: number }
  | { ok: false; error: string };

/** Password-verifying endpoints: 10 tries per client per 15 minutes. */
function throttleFail(limit: { retryAfterSeconds?: number }): {
  ok: false;
  error: string;
} {
  return {
    ok: false,
    error: `Too many attempts. Try again in ${limit.retryAfterSeconds ?? 60}s.`,
  };
}

const tokenSchema = z.string().trim().regex(/^[0-9a-f]{16,64}$/i, "Invalid setup link");
const passwordSchema = z.string().trim().min(4).max(72);

export async function setupCheckAction(input: {
  token: string;
  password: string;
}): Promise<PublicCheckResult> {
  const parsed = z
    .object({ token: tokenSchema, password: passwordSchema })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const limit = rateLimit(
    await clientRateKey("public-setup-check", parsed.data.token),
    10,
    15 * 60_000
  );
  if (!limit.ok) return throttleFail(limit);
  try {
    const res = await publicCheckSetup(parsed.data.token, parsed.data.password);
    return { ok: true, organizationName: res.organization_name ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid link or password" };
  }
}

const questionSchema = z.object({
  question_text: z.string().trim().min(1).max(4000),
  category: z.string().trim().max(120).optional(),
  difficulty: z.string().trim().max(60).optional(),
  points: z.number().int().refine((p) => [100, 200, 300, 500, 1000].includes(p)),
  point_color: z.string().trim().max(32).optional(),
  time_limit: z.number().int().min(5).max(600).optional(),
  explanation: z.string().trim().max(4000).optional(),
  correct_key: z.string().trim().min(1).max(8),
  options: z
    .array(z.object({ key: z.string().trim().min(1).max(8), text: z.string().trim().min(1).max(2000) }))
    .min(2)
    .max(8),
});

const setupSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
  title: z.string().trim().min(3).max(200),
  teamOne: z.string().trim().min(1).max(120),
  teamTwo: z.string().trim().min(1).max(120),
  timePerQuestion: z.number().int().min(5).max(600),
  questions: z.array(questionSchema).min(1).max(200),
});

export async function setupCompleteAction(input: {
  token: string;
  password: string;
  title: string;
  teamOne: string;
  teamTwo: string;
  timePerQuestion: number;
  questions: unknown[];
}): Promise<PublicActionResult & { questionCount?: number }> {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const limit = rateLimit(
    await clientRateKey("public-setup-complete", parsed.data.token),
    10,
    15 * 60_000
  );
  if (!limit.ok) return throttleFail(limit);
  try {
    const res = await publicCompleteSetup({
      ...parsed.data,
      questions: parsed.data.questions.map((q) => ({
        ...q,
        options: q.options.map((o, i) => ({ ...o, display_order: i + 1 })),
      })),
    });
    return { ok: true, questionCount: res.question_count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the setup" };
  }
}

const startSchema = z.object({
  title: z.string().trim().min(1).max(200),
  password: passwordSchema,
});

/** Start (or resume) a competition from the home screen. */
export async function publicStartAction(input: {
  title: string;
  password: string;
}): Promise<PublicStartResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const limit = rateLimit(
    await clientRateKey("public-start", parsed.data.title.toLowerCase()),
    10,
    15 * 60_000
  );
  if (!limit.ok) return throttleFail(limit);
  try {
    const bundle = await publicStart(parsed.data.title, parsed.data.password);
    return { ok: true, bundle };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid title or password" };
  }
}

/** Re-verify title + password for a refresh-safe resume on /run. */
export async function publicGetBundleAction(input: {
  title: string;
  password: string;
}): Promise<PublicStartResult> {
  return publicStartAction(input);
}

const eventSchema = z.object({
  event_id: z.uuid(),
  competition_id: z.uuid(),
  device_id: z.string().min(1).max(64),
  sequence_number: z.number().int().min(0),
  created_at: z.number().int().min(0),
  event_type: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()),
});

/**
 * Batched event flush from the run screen. Legitimate runs flush roughly once
 * per question (plus retries), so the window is generous compared to the
 * password gates; sequence numbers and points are re-derived server-side.
 */
export async function publicRecordEventsAction(input: {
  competitionId: string;
  password: string;
  events: unknown[];
}): Promise<PublicRecordResult> {
  const parsed = z
    .object({
      competitionId: z.uuid(),
      password: passwordSchema,
      events: z.array(z.unknown()).min(1).max(500),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const events: EngineEvent[] = [];
  for (const raw of parsed.data.events) {
    const ev = eventSchema.safeParse(raw);
    // The narrow EventType union is enforced by the RPC's allowlist; JSON in,
    // typed EngineEvent out.
    if (ev.success) events.push(ev.data as unknown as EngineEvent);
  }
  if (events.length === 0) return { ok: false, error: "No valid events in batch" };
  const limit = rateLimit(
    await clientRateKey("public-events", parsed.data.competitionId),
    240,
    15 * 60_000
  );
  if (!limit.ok) return throttleFail(limit);
  try {
    const res = await publicRecordEvents(parsed.data.competitionId, parsed.data.password, events);
    return { ok: true, lastSequence: res.last_sequence };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save progress" };
  }
}
