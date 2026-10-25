import { NextRequest, NextResponse } from "next/server";
import { listEvents } from "@/lib/queries";
import { icsCalendar, eventUid } from "@/lib/ics";
import { categoryName, isSportSub, isTopCategory } from "@/lib/categories";
import { markdownToText } from "@/lib/markdown";
import { absoluteUrl } from "@/lib/site";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";
export const revalidate = 1800;

// GET /api/calendar.ics[?category=<top-level or sport slug>]
// Subscribable feed: events from the last 30 days onward.
export async function GET(req: NextRequest) {
  const cat = req.nextUrl.searchParams.get("category")?.trim().toLowerCase() || null;
  if (cat && !isTopCategory(cat) && !isSportSub(cat)) {
    return new NextResponse("unknown category", { status: 404 });
  }
  const events = await listEvents({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    category: cat ? (isSportSub(cat) ? "sports" : cat) : null,
    sub: cat && isSportSub(cat) ? cat : null,
    limit: 2000,
  });
  const body = icsCalendar(
    events.map((e) => {
      const url = absoluteUrl(`/events/${e.slug}`);
      return {
        uid: eventUid(e.slug),
        title: e.title,
        startsAt: e.starts_at,
        endsAt: e.ends_at,
        allDay: e.all_day,
        description: [e.summary ?? markdownToText(e.description, 500), url].filter(Boolean).join("\n\n"),
        location: [e.venue_name, e.area, "Bangkok"].filter(Boolean).join(", "),
        url,
        updatedAt: e.updated_at,
        status: e.status,
        categories: [categoryName(e.category_slug), ...(e.subcategory_slug ? [categoryName(e.subcategory_slug)] : [])],
      };
    }),
    { name: cat ? `${t.site.name}: ${categoryName(cat)}` : t.site.name },
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="bangkok-events${cat ? `-${cat}` : ""}.ics"`,
      "Cache-Control": "public, max-age=1800, s-maxage=1800",
    },
  });
}
