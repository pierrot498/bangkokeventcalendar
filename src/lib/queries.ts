import "server-only";
import { getSupabasePublic, isMissingTableError } from "./supabase/server";
import type { EventRow, PostRow, SourceRow, VenueRow } from "./supabase/types";

// Public reads. Every function degrades to an empty result (and logs) when
// Supabase isn't configured, the bke_ tables don't exist yet, or a query
// fails, so pages render their empty states instead of crashing. Filters on
// status / duplicate_of are explicit (not left to RLS) because the client may
// fall back to the service-role key — see supabase/server.ts.

export const EVENT_COLS =
  "id, slug, title, summary, description, category_slug, subcategory_slug, tags, starts_at, ends_at, all_day, timezone, venue_id, venue_name, area, address, price_text, is_free, ticket_url, source_url, image_url, organizer, status, featured, updated_at";
const LIST_COLS =
  "id, slug, title, summary, category_slug, subcategory_slug, tags, starts_at, ends_at, all_day, timezone, venue_id, venue_name, area, price_text, is_free, image_url, status, featured, updated_at";

const warnedTables = new Set<string>();

type Res<T> = { data: T | null; error: { code?: string; message: string } | null };

async function run<T>(name: string, table: string, fallback: T, exec: (sb: NonNullable<ReturnType<typeof getSupabasePublic>>) => PromiseLike<Res<T>>): Promise<T> {
  const sb = getSupabasePublic();
  if (!sb) return fallback;
  try {
    const { data, error } = await exec(sb);
    if (error) {
      if (isMissingTableError(error)) {
        if (!warnedTables.has(table)) {
          warnedTables.add(table);
          console.warn(`[supabase] table ${table} missing: run supabase/migrations/0001_init.sql`);
        }
      } else {
        console.error(`[supabase] ${name} table=${table} FAILED: ${error.message}`);
      }
      return fallback;
    }
    return (data ?? fallback) as T;
  } catch (e) {
    console.error(`[supabase] ${name} table=${table} THREW: ${e instanceof Error ? e.message : String(e)}`);
    return fallback;
  }
}

export type EventQuery = {
  limit?: number;
  category?: string | null;
  sub?: string | null;
  start?: Date | null; // overlap window; defaults to "now" (upcoming)
  end?: Date | null;
  freeOnly?: boolean;
  area?: string | null;
  venueId?: string | null;
  excludeId?: string | null;
  featuredOnly?: boolean;
  ascending?: boolean;
};

// Events overlapping [start, end] (start defaults to now → upcoming only:
// past events drop out of every listing automatically).
export async function listEvents(q: EventQuery = {}): Promise<EventRow[]> {
  const startIso = (q.start ?? new Date()).toISOString();
  return run<EventRow[]>("listEvents", "bke_events", [], (sb) => {
    let query = sb
      .from("bke_events")
      .select(LIST_COLS)
      .in("status", ["published", "cancelled"])
      .is("duplicate_of", null)
      .or(`starts_at.gte.${startIso},ends_at.gte.${startIso}`);
    if (q.end) query = query.lte("starts_at", q.end.toISOString());
    if (q.category) query = query.eq("category_slug", q.category);
    if (q.sub) query = query.eq("subcategory_slug", q.sub);
    if (q.freeOnly) query = query.eq("is_free", true);
    if (q.area) query = query.eq("area", q.area);
    if (q.venueId) query = query.eq("venue_id", q.venueId);
    if (q.excludeId) query = query.neq("id", q.excludeId);
    if (q.featuredOnly) query = query.eq("featured", true);
    return query.order("starts_at", { ascending: q.ascending ?? true }).limit(q.limit ?? 200) as unknown as PromiseLike<Res<EventRow[]>>;
  });
}

// Past events at a venue (newest first).
export async function listPastVenueEvents(venueId: string, limit = 12): Promise<EventRow[]> {
  const now = new Date().toISOString();
  return run<EventRow[]>("listPastVenueEvents", "bke_events", [], (sb) =>
    sb
      .from("bke_events")
      .select(LIST_COLS)
      .eq("status", "published")
      .is("duplicate_of", null)
      .eq("venue_id", venueId)
      .lt("starts_at", now)
      .order("starts_at", { ascending: false })
      .limit(limit) as unknown as PromiseLike<Res<EventRow[]>>,
  );
}

export async function getEventBySlug(slug: string): Promise<EventRow | null> {
  return run<EventRow | null>("getEventBySlug", "bke_events", null, (sb) =>
    sb
      .from("bke_events")
      .select(EVENT_COLS)
      .eq("slug", slug)
      .in("status", ["published", "cancelled"])
      .is("duplicate_of", null)
      .maybeSingle() as unknown as PromiseLike<Res<EventRow | null>>,
  );
}

// Distinct areas of upcoming events, for the filter dropdown.
export async function listAreas(): Promise<string[]> {
  const rows = await run<{ area: string | null }[]>("listAreas", "bke_events", [], (sb) => {
    const now = new Date().toISOString();
    return sb
      .from("bke_events")
      .select("area")
      .eq("status", "published")
      .is("duplicate_of", null)
      .or(`starts_at.gte.${now},ends_at.gte.${now}`)
      .not("area", "is", null)
      .limit(2000) as unknown as PromiseLike<Res<{ area: string | null }[]>>;
  });
  return Array.from(new Set(rows.map((r) => r.area?.trim()).filter((a): a is string => !!a))).sort((a, b) => a.localeCompare(b));
}

export async function getVenueBySlug(slug: string): Promise<VenueRow | null> {
  return run<VenueRow | null>("getVenueBySlug", "bke_venues", null, (sb) =>
    sb
      .from("bke_venues")
      .select("id, slug, name, area, address, lat, lng, url, description")
      .eq("slug", slug)
      .maybeSingle() as unknown as PromiseLike<Res<VenueRow | null>>,
  );
}

export async function getVenueById(id: string): Promise<VenueRow | null> {
  return run<VenueRow | null>("getVenueById", "bke_venues", null, (sb) =>
    sb
      .from("bke_venues")
      .select("id, slug, name, area, address, lat, lng, url, description")
      .eq("id", id)
      .maybeSingle() as unknown as PromiseLike<Res<VenueRow | null>>,
  );
}

const POST_COLS = "id, slug, title, description, body_md, cover_image_url, tags, category, published_at, updated_at";

export async function listPosts(limit = 50): Promise<PostRow[]> {
  return run<PostRow[]>("listPosts", "bke_posts", [], (sb) =>
    sb
      .from("bke_posts")
      .select(POST_COLS)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .limit(limit) as unknown as PromiseLike<Res<PostRow[]>>,
  );
}

export async function getPostBySlug(slug: string): Promise<PostRow | null> {
  return run<PostRow | null>("getPostBySlug", "bke_posts", null, (sb) =>
    sb
      .from("bke_posts")
      .select(POST_COLS)
      .eq("slug", slug)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .maybeSingle() as unknown as PromiseLike<Res<PostRow | null>>,
  );
}

export async function listSources(): Promise<SourceRow[]> {
  return run<SourceRow[]>("listSources", "bke_sources", [], (sb) =>
    sb
      .from("bke_sources")
      .select("id, slug, name, url, kind, category_slug, notes, last_checked_at")
      .eq("enabled", true)
      .order("name", { ascending: true })
      .limit(1000) as unknown as PromiseLike<Res<SourceRow[]>>,
  );
}

// Sitemap helpers.
export async function listEventSlugsForSitemap(): Promise<{ slug: string; updated_at: string; starts_at: string }[]> {
  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  return run("sitemapEvents", "bke_events", [] as { slug: string; updated_at: string; starts_at: string }[], (sb) =>
    sb
      .from("bke_events")
      .select("slug, updated_at, starts_at")
      .eq("status", "published")
      .is("duplicate_of", null)
      .gte("starts_at", since)
      .order("starts_at", { ascending: true })
      .limit(10000) as unknown as PromiseLike<Res<{ slug: string; updated_at: string; starts_at: string }[]>>,
  );
}

export async function listVenueSlugs(): Promise<{ slug: string; updated_at: string }[]> {
  return run("sitemapVenues", "bke_venues", [] as { slug: string; updated_at: string }[], (sb) =>
    sb.from("bke_venues").select("slug, updated_at").limit(5000) as unknown as PromiseLike<Res<{ slug: string; updated_at: string }[]>>,
  );
}
