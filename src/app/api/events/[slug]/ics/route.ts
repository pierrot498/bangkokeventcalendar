import { NextRequest, NextResponse } from "next/server";
import { getEventBySlug } from "@/lib/queries";
import { icsCalendar, eventUid } from "@/lib/ics";
import { markdownToText } from "@/lib/markdown";
import { decodeSlug } from "@/lib/url";
import { absoluteUrl } from "@/lib/site";

export const runtime = "nodejs";

// GET /api/events/<slug>/ics — single-event download (from runclubbangkok).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const slug = decodeSlug((await ctx.params).slug);
  const e = await getEventBySlug(slug);
  if (!e) return new NextResponse("not found", { status: 404 });
  const url = absoluteUrl(`/events/${e.slug}`);
  const body = icsCalendar([
    {
      uid: eventUid(e.slug),
      title: e.title,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      allDay: e.all_day,
      description: [e.summary ?? markdownToText(e.description, 800), url].filter(Boolean).join("\n\n"),
      location: [e.venue_name, e.address, e.area, "Bangkok"].filter(Boolean).join(", "),
      url,
      updatedAt: e.updated_at,
      status: e.status,
    },
  ]);
  const safeName = e.slug.replace(/[^a-zA-Z0-9_-]/g, "") || "event";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
