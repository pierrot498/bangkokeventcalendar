// Write normalized events to bke_events, keyed by (source, external_id).
// New rows are inserted as published (or cancelled). Existing rows only
// get EMPTY fields filled plus last_seen_at / needs_review=false, so hand
// edits, dedupe decisions (status / duplicate_of) and `featured` survive.
import { slugify } from "../../slug";
import { bangkokDate } from "../../datetime";
import { dbError, jobsDb, selectAll } from "../db";
import type { JobContext, NormalizedEvent } from "../types";

const FILLABLE = [
  "summary",
  "description",
  "image_url",
  "ticket_url",
  "source_url",
  "venue_name",
  "venue_id",
  "address",
  "area",
  "price_text",
  "organizer",
  "ends_at",
  "subcategory_slug",
] as const;

type Existing = { id: string; slug: string; external_id: string } & Partial<
  Record<(typeof FILLABLE)[number], string | null>
>;

export type UpsertStats = { inserted: number; updated: number; seen: number; venues_created: number };

export class EventWriter {
  private slugs = new Set<string>();
  private venues = new Map<string, string>(); // slug → id
  private existing = new Map<string, Existing>(); // `${source}\u0000${external_id}` → row
  private loadedSources = new Set<string>();

  constructor(private ctx: JobContext) {}

  async init(): Promise<void> {
    if (this.ctx.tablesMissing) return;
    const rows = await selectAll<{ slug: string }>(
      (f, t) => jobsDb().from("bke_events").select("slug").range(f, t),
      "bke_events slugs",
    );
    for (const r of rows) this.slugs.add(r.slug);
    const venues = await selectAll<{ id: string; slug: string }>(
      (f, t) => jobsDb().from("bke_venues").select("id, slug").range(f, t),
      "bke_venues",
    );
    for (const v of venues) this.venues.set(v.slug, v.id);
  }

  private async loadSource(source: string): Promise<void> {
    if (this.loadedSources.has(source) || this.ctx.tablesMissing) return;
    this.loadedSources.add(source);
    const rows = await selectAll<Existing>(
      (f, t) =>
        jobsDb()
          .from("bke_events")
          .select(`id, slug, external_id, ${FILLABLE.join(", ")}`)
          .eq("source", source)
          .not("external_id", "is", null)
          .range(f, t),
      `bke_events source=${source}`,
    );
    for (const r of rows) this.existing.set(`${source}\u0000${r.external_id}`, r);
  }

  private uniqueSlug(e: NormalizedEvent): string {
    const base = `${slugify(e.title, 70)}-${bangkokDate(e.starts_at).replace(/-/g, "")}`;
    let slug = base;
    for (let i = 2; this.slugs.has(slug); i++) slug = `${base}-${i}`;
    this.slugs.add(slug);
    return slug;
  }

  private async venueId(e: NormalizedEvent, stats: UpsertStats): Promise<string | null> {
    if (!e.venue_name) return null;
    const slug = slugify(e.venue_name, 80);
    const known = this.venues.get(slug);
    if (known) return known;
    if (this.ctx.dryRun || this.ctx.tablesMissing) return null;
    const { data, error } = await jobsDb()
      .from("bke_venues")
      .upsert(
        { slug, name: e.venue_name, area: e.area, address: e.address, lat: e.lat, lng: e.lng },
        { onConflict: "slug", ignoreDuplicates: false },
      )
      .select("id")
      .single();
    if (error) throw dbError(error, `venue ${slug}`);
    stats.venues_created++;
    this.venues.set(slug, data.id as string);
    return data.id as string;
  }

  async write(events: NormalizedEvent[]): Promise<UpsertStats> {
    const stats: UpsertStats = { inserted: 0, updated: 0, seen: 0, venues_created: 0 };
    const now = new Date().toISOString();
    const inserts: Record<string, unknown>[] = [];
    for (const e of events) {
      await this.loadSource(e.source);
      const key = `${e.source}\u0000${e.external_id}`;
      const ex = this.existing.get(key);
      const venue_id = await this.venueId(e, stats);
      if (!ex) {
        const slug = this.uniqueSlug(e);
        this.existing.set(key, { id: "(new)", slug, external_id: e.external_id });
        stats.inserted++;
        this.ctx.changedSlugs.add(slug);
        if (this.ctx.dryRun) {
          this.ctx.log(`  + ${e.source} ${bangkokDate(e.starts_at)} ${e.title} [${e.category_slug}${e.subcategory_slug ? `/${e.subcategory_slug}` : ""}]`);
          continue;
        }
        inserts.push({
          slug,
          title: e.title,
          summary: e.summary,
          description: e.description,
          category_slug: e.category_slug,
          subcategory_slug: e.subcategory_slug,
          tags: e.tags,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          all_day: e.all_day,
          venue_id,
          venue_name: e.venue_name,
          area: e.area,
          address: e.address,
          price_text: e.price_text,
          is_free: e.is_free,
          ticket_url: e.ticket_url,
          source_url: e.source_url,
          image_url: e.image_url,
          organizer: e.organizer,
          status: e.cancelled ? "cancelled" : "published",
          source: e.source,
          external_id: e.external_id,
          source_id: e.source_id,
          last_seen_at: now,
          needs_review: false,
        });
        continue;
      }
      if (ex.id === "(new)") continue; // same event twice in one run
      const incoming: Record<string, unknown> = { ...e, venue_id };
      const patch: Record<string, unknown> = {};
      for (const f of FILLABLE) {
        const cur = ex[f];
        const val = incoming[f];
        if ((cur === null || cur === undefined || cur === "") && val !== null && val !== undefined && val !== "") {
          patch[f] = val;
        }
      }
      const changed = Object.keys(patch).length > 0;
      if (changed) {
        stats.updated++;
        this.ctx.changedSlugs.add(ex.slug);
      } else stats.seen++;
      if (this.ctx.dryRun) {
        if (changed) this.ctx.log(`  ~ ${ex.slug}: fill ${Object.keys(patch).join(", ")}`);
        continue;
      }
      const { error } = await jobsDb()
        .from("bke_events")
        .update({ ...patch, last_seen_at: now, needs_review: false })
        .eq("id", ex.id);
      if (error) throw dbError(error, `update ${ex.slug}`);
    }
    for (let i = 0; i < inserts.length; i += 100) {
      const { error } = await jobsDb().from("bke_events").insert(inserts.slice(i, i + 100));
      if (error) throw dbError(error, "insert bke_events");
    }
    return stats;
  }
}
