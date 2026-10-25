// Step "fetch": pull events from every enabled bke_sources row and from
// runclubbangkok's run_events, normalise, upsert.
//
// Per source (fetch_mode 'auto' tries these in order):
//   ical   → .ics feed (feed_url or url)
//   jsonld → schema.org Event JSON-LD on the page; if none, follow event
//            detail links (Eventpop / Ticketmelon / RA / Meetup / Playtomic …)
//            and read their JSON-LD
//   ai     → Claude extraction of the visible page text (needs
//            ANTHROPIC_API_KEY; capped per run; never in --dry-run)
import { bangkokDate } from "../../datetime";
import { isMissingTable, jobsDb, selectAll } from "../db";
import { fetchText, sleep } from "../http";
import { hashId, normalizeRaw } from "../normalize";
import { aiAvailable, extractEventsWithClaude } from "../parsers/ai";
import { eventsFromIcs } from "../parsers/ical";
import { detailLinks, eventsFromJsonLd, ogImage, pageText } from "../parsers/jsonld";
import { emptyStats, type JobContext, type NormalizedEvent, type RawEvent, type StepResult } from "../types";
import { runclubRaces } from "./runclub";
import { EventWriter } from "./upsert";

const MAX_DETAIL_PAGES = 15;
const MAX_AI_CALLS = Number(process.env.JOBS_MAX_AI_CALLS ?? 10);
const UNSCRAPEABLE = /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com|x\.com|twitter\.com|line\.me|youtube\.com)$/i;

type SourceRow = {
  id: string;
  slug: string;
  name: string;
  url: string;
  kind: string | null;
  category_slug: string | null;
  feed_url: string | null;
  fetch_mode: "auto" | "jsonld" | "ical" | "ai" | "none";
};

type SourceOutcome = { raws: RawEvent[]; via: string; note?: string };

let aiCalls = 0;

async function fetchSource(ctx: JobContext, s: SourceRow): Promise<SourceOutcome> {
  const target = s.feed_url || s.url;
  const host = new URL(target).hostname;
  if (UNSCRAPEABLE.test(host)) return { raws: [], via: "skip", note: "social profile (not scrapeable)" };

  const res = await fetchText(target);
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);

  const looksIcs = /text\/calendar/i.test(res.contentType) || /\.ics(\?|$)/i.test(target) || /^BEGIN:VCALENDAR/m.test(res.text.slice(0, 200));
  if (s.fetch_mode === "ical" || (s.fetch_mode === "auto" && looksIcs)) {
    return { raws: eventsFromIcs(res.text, res.finalUrl), via: "ical" };
  }

  if (s.fetch_mode !== "ai") {
    const direct = eventsFromJsonLd(res.text, res.finalUrl);
    if (direct.length) return { raws: direct, via: "jsonld" };
    const links = detailLinks(res.text, res.finalUrl, MAX_DETAIL_PAGES);
    const fromDetails: RawEvent[] = [];
    for (const link of links) {
      try {
        await sleep(400);
        const d = await fetchText(link);
        if (d.status >= 400) continue;
        const evs = eventsFromJsonLd(d.text, d.finalUrl);
        const img = ogImage(d.text);
        for (const e of evs) fromDetails.push({ ...e, image_url: e.image_url ?? img, url: e.url ?? d.finalUrl });
      } catch {
        // one broken detail page shouldn't sink the source
      }
    }
    if (fromDetails.length) return { raws: fromDetails, via: `jsonld-details(${links.length} links)` };
    if (s.fetch_mode === "jsonld") return { raws: [], via: "jsonld", note: "no Event JSON-LD found" };
  }

  if (!aiAvailable()) return { raws: [], via: "ai", note: "no structured data; ANTHROPIC_API_KEY unset" };
  if (ctx.dryRun) return { raws: [], via: "ai", note: "would call Claude (skipped in --dry-run)" };
  if (aiCalls >= MAX_AI_CALLS) return { raws: [], via: "ai", note: `AI cap (${MAX_AI_CALLS}) reached` };
  aiCalls++;
  const raws = await extractEventsWithClaude(pageText(res.text), res.finalUrl, bangkokDate(new Date()));
  return { raws, via: "ai" };
}

function sourceKind(via: string): string {
  if (via.startsWith("jsonld")) return "jsonld";
  return via; // ical | ai
}

export async function runFetch(ctx: JobContext): Promise<StepResult> {
  const stats = emptyStats();
  const dropped: Record<string, number> = {};
  const perSource: Record<string, string> = {};
  const writer = new EventWriter(ctx);
  await writer.init();
  const normalized: NormalizedEvent[] = [];

  const take = (raws: RawEvent[], source: string, sourceId: string | null, sourceCategory: string | null) => {
    let kept = 0;
    for (const raw of raws) {
      stats.fetched++;
      const fallbackId = hashId(`${raw.url ?? ""}|${raw.title}|${raw.start}`);
      const r = normalizeRaw(raw, { source, sourceId, sourceCategory, fallbackId });
      if (!r.ok) {
        stats.skipped++;
        dropped[r.reason] = (dropped[r.reason] ?? 0) + 1;
        continue;
      }
      // Namespace external ids by source row so two sources never collide.
      if (sourceId) r.event.external_id = `${sourceId.slice(0, 8)}:${r.event.external_id}`.slice(0, 500);
      normalized.push(r.event);
      kept++;
    }
    return kept;
  };

  // 1. bke_sources
  let sources: SourceRow[] = [];
  if (ctx.tablesMissing) {
    ctx.log("  bke_sources missing: skipping registry sources (dry run)");
  } else {
    try {
      sources = await selectAll<SourceRow>(
        (f, t) =>
          jobsDb()
            .from("bke_sources")
            .select("id, slug, name, url, kind, category_slug, feed_url, fetch_mode")
            .eq("enabled", true)
            .neq("fetch_mode", "none")
            .order("name")
            .range(f, t),
        "bke_sources",
      );
    } catch (e) {
      const pg = (e as { pg?: { code?: string; message?: string } }).pg;
      if (!isMissingTable(pg)) throw e;
    }
  }

  for (const s of sources) {
    let status = "ok";
    let count = 0;
    try {
      const out = await fetchSource(ctx, s);
      count = take(out.raws, sourceKind(out.via), s.id, s.category_slug);
      status = out.note ? `${out.via}: ${out.note}` : `${out.via}: ${out.raws.length} found, ${count} kept`;
    } catch (e) {
      status = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
    }
    perSource[s.slug] = status;
    ctx.log(`  source ${s.slug}: ${status}`);
    if (!ctx.dryRun) {
      await jobsDb()
        .from("bke_sources")
        .update({ last_checked_at: new Date().toISOString(), last_status: status, last_event_count: count })
        .eq("id", s.id);
    }
  }

  // 2. runclubbangkok races
  try {
    const races = await runclubRaces();
    const kept = take(races, "runclubbangkok", null, "running");
    perSource["runclubbangkok"] = `${races.length} found, ${kept} kept`;
    ctx.log(`  runclubbangkok run_events: ${races.length} found, ${kept} kept`);
  } catch (e) {
    perSource["runclubbangkok"] = `error: ${e instanceof Error ? e.message : String(e)}`;
    ctx.log(`  runclubbangkok run_events: ${perSource["runclubbangkok"]}`);
  }

  // 3. write
  if (ctx.tablesMissing) {
    stats.inserted = normalized.length;
    if (ctx.dryRun) for (const e of normalized.slice(0, 15)) ctx.log(`  + ${e.source} ${bangkokDate(e.starts_at)} ${e.title}`);
    if (normalized.length > 15) ctx.log(`  … and ${normalized.length - 15} more`);
  } else {
    const w = await writer.write(normalized);
    stats.inserted = w.inserted;
    stats.updated = w.updated;
    stats.unchanged = w.seen;
    stats.venues_created = w.venues_created;
  }
  stats.sources = perSource;
  stats.dropped = dropped;
  stats.ai_calls = aiCalls;

  return {
    status: "ok",
    stats,
    summary: `${sources.length} sources + runclubbangkok: fetched ${stats.fetched}, ${ctx.dryRun ? "would insert" : "inserted"} ${stats.inserted}, updated ${stats.updated}, dropped ${stats.skipped}`,
  };
}
