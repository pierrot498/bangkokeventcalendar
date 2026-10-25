import type { NextRequest } from "next/server";

// Simple fixed-window, per-IP rate limiter held in memory.
//
// BEST-EFFORT ONLY: on Vercel each serverless instance has its own
// memory, instances are recycled, and concurrent requests may land on
// different instances, so a determined client can exceed the limit.
// It still stops naive floods from a single IP. Swap for a shared store
// (Upstash/Redis, Supabase table) if real enforcement is needed.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/** Returns true if the request is allowed, false if the limit is exceeded. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size > MAX_KEYS) buckets.clear();
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  return {
    ok: b.count <= limit,
    retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
  };
}
