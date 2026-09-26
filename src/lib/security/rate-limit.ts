import { headers } from "next/headers";

/**
 * Lightweight in-memory fixed-window rate limiter (spec §89 "Rate limiting where
 * applicable"). Guards brute-forceable, unauthenticated server actions such as
 * access-code validation (§100). Per-instance only — a single Node process is
 * the deployment target; for multi-instance setups front this with an edge
 * limiter. Buckets are swept opportunistically to bound memory.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds?: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  existing.count += 1;
  return { ok: true };
}

/**
 * Best-effort client identifier for rate-limit keys. Server actions run behind
 * the platform proxy, so x-forwarded-for/x-real-ip is the usual signal; falls
 * back to a coarse bucket when headers are absent.
 */
export async function clientRateKey(scope: string, seed: string): Promise<string> {
  let ip = "unknown";
  try {
    const h = await headers();
    ip =
      h.get("x-real-ip") ??
      (h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown");
  } catch {
    /* headers unavailable outside a request context */
  }
  return `${scope}:${ip}:${seed}`;
}
