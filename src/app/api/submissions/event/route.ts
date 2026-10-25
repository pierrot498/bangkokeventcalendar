import { NextRequest, NextResponse } from "next/server";
import { getSupabaseForSubmissions, isMissingTableError } from "@/lib/supabase/server";
import { EventSubmissionSchema } from "@/lib/submission-schema";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

// Adapted from runclubbangkok: zod-validated, rate-limited, honeypot, and
// status is always forced to "pending" server-side.
export async function POST(req: NextRequest) {
  const sb = getSupabaseForSubmissions();
  if (!sb) return NextResponse.json({ error: "Submissions are temporarily disabled." }, { status: 503 });

  const ip = clientIp(req);
  const rl = rateLimit(`submit-event:${ip}`, LIMIT, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = EventSubmissionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  if (d.website) return NextResponse.json({ ok: true });

  const { error } = await sb.from("bke_event_submissions").insert({
    status: "pending",
    title: d.title,
    category_slug: d.category_slug ?? null,
    starts_at: d.starts_at ?? null,
    ends_at: d.ends_at ?? null,
    venue_name: d.venue_name ?? null,
    area: d.area ?? null,
    price_text: d.price_text ?? null,
    is_free: d.is_free ?? null,
    ticket_url: d.ticket_url ?? null,
    image_url: d.image_url ?? null,
    description: d.description ?? null,
    organizer_name: d.organizer_name ?? null,
    contact_email: d.contact_email ?? null,
    source_url: d.source_url ?? null,
    ip: ip === "unknown" ? null : ip,
    user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
  });
  if (error) {
    console.error("[submissions/event] insert failed:", error.message);
    const missing = isMissingTableError(error);
    return NextResponse.json({ error: missing ? "not_ready" : "insert_failed" }, { status: missing ? 503 : 500 });
  }
  return NextResponse.json({ ok: true });
}
