import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// On-demand ISR refresh, called by the daily job (scripts/run-job.ts).
// Secret via `Authorization: Bearer <secret>` or `?secret=<secret>`.
function authorized(req: NextRequest, secret: string): boolean {
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const given = header || req.nextUrl.searchParams.get("secret") || "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!authorized(req, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, revalidated: "/", at: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
