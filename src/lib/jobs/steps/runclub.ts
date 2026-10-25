// Import upcoming published Bangkok races from runclubbangkok's run_events
// (same Supabase project) so both sites stay in sync.
import { jobsDb, selectAll } from "../db";
import type { RawEvent } from "../types";

type RunEvent = {
  id: string;
  slug_en: string;
  name_en: string | null;
  description_en: string | null;
  starts_at: string;
  ends_at: string | null;
  meeting_point_en: string | null;
  registration_url: string | null;
  hero_image: string | null;
};

export async function runclubRaces(): Promise<RawEvent[]> {
  const nowIso = new Date().toISOString();
  const rows = await selectAll<RunEvent>(
    (from, to) =>
      jobsDb()
        .from("run_events")
        .select("id, slug_en, name_en, description_en, starts_at, ends_at, meeting_point_en, registration_url, hero_image")
        .eq("is_published", true)
        .is("duplicate_of", null)
        .gte("starts_at", nowIso)
        .order("starts_at")
        .range(from, to),
    "run_events",
  );
  return rows
    .filter((r) => r.name_en && r.starts_at)
    .map((r) => ({
      external_id: r.id,
      title: r.name_en!,
      description: r.description_en,
      category: "sports",
      subcategory: "running",
      tags: ["running", "race"],
      start: r.starts_at,
      end: r.ends_at,
      venue_name: r.meeting_point_en,
      ticket_url: r.registration_url,
      url: `https://www.runclubbangkok.com/en/events/${encodeURIComponent(r.slug_en)}`,
      image_url: r.hero_image,
      organizer: null,
    }));
}
