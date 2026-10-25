// Step "dedupe": link duplicate events (cross-source and within a source).
//
//   dedupe_key = normalised title | Bangkok date | venue slug
//
// Pass 1 groups rows with an identical key. Pass 2 (fuzzy) clusters rows on
// the same Bangkok date whose venues match (same slug, overlapping tokens,
// or both missing) and whose titles are ≥ 0.8 similar (max of token Jaccard
// and character-trigram Dice). In each cluster the richest row is kept; its
// empty fields are filled from the others and tags are unioned. The others
// get duplicate_of = keeper and status = 'draft' (not deleted, so the next
// fetch updates them instead of re-inserting, which keeps this idempotent;
// public queries and RLS hide rows with duplicate_of set).
import { slugify } from "../../slug";
import { bangkokDate } from "../../datetime";
import { dbError, jobsDb, selectAll } from "../db";
import { emptyStats, type JobContext, type StepResult } from "../types";

export type Row = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  venue_id: string | null;
  venue_name: string | null;
  area: string | null;
  address: string | null;
  price_text: string | null;
  ticket_url: string | null;
  source_url: string | null;
  image_url: string | null;
  organizer: string | null;
  subcategory_slug: string | null;
  tags: string[] | null;
  source: string;
  featured: boolean;
  dedupe_key: string | null;
  created_at: string;
};

const COLS =
  "id, slug, title, summary, description, starts_at, ends_at, venue_id, venue_name, area, address, price_text, ticket_url, source_url, image_url, organizer, subcategory_slug, tags, source, featured, dedupe_key, created_at";

const MERGE_FIELDS = [
  "summary",
  "description",
  "ends_at",
  "venue_id",
  "venue_name",
  "area",
  "address",
  "price_text",
  "ticket_url",
  "source_url",
  "image_url",
  "organizer",
  "subcategory_slug",
] as const;

const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "at", "in", "on", "for", "by", "with", "to", "x", "vs",
  "presents", "present", "live", "edition", "vol", "no", "official", "event", "events", "ครั้งที่", "ที่", "และ",
  "bangkok", "bkk", "thailand", "thai", "กรุงเทพ", "กรุงเทพฯ", "กรุงเทพมหานคร",
]);

// Cheap Thai/English variants mapped to one token.
const VARIANTS: [RegExp, string][] = [
  [/มาราธอน/g, " marathon "],
  [/ฮาล์ฟ/g, " half "],
  [/คอนเสิร์ต/g, " concert "],
  [/เทศกาล/g, " festival "],
  [/ตลาด/g, " market "],
  [/วิ่ง/g, " run "],
  [/\bfest\b/g, " festival "],
  [/\btheatre\b/g, " theater "],
  [/&/g, " and "],
];

export function titleTokens(title: string): string[] {
  let s = title.normalize("NFKC").toLowerCase();
  for (const [re, rep] of VARIANTS) s = s.replace(re, rep);
  s = s.replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ");
  return s
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !/^(19|20|25)\d\d$/.test(t)) // years incl. Thai Buddhist (25xx)
    .filter((t) => !/^\d+(st|nd|rd|th)$/.test(t))
    .filter((t) => !STOPWORDS.has(t));
}

export function normTitle(title: string): string {
  return titleTokens(title).join("");
}

export function dedupeKey(r: Pick<Row, "title" | "starts_at" | "venue_name">): string {
  return `${normTitle(r.title)}|${bangkokDate(r.starts_at)}|${r.venue_name ? slugify(r.venue_name, 60) : ""}`;
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  const A = trigrams(a);
  const B = trigrams(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

const DISCRIMINATORS =
  /^(triathlon|duathlon|aquathlon|swimrun|marathon|half|ultra|trail|kids|junior|women|men|\d+k|\d+km|day\d*|night|morning|matinee|part\d*|ii|iii|iv|\d+)$/;
const LOCATION = /^(bangkok|bkk|thailand|กรุงเทพ|กรุงเทพฯ|กรุงเทพมหานคร)$/;
function compactRaw(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t && !/^(19|20|25)\d\d$/.test(t) && !LOCATION.test(t))
    .join("");
}

export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  // Tokens that tell sibling events apart (Triathlon vs Duathlon, #3 vs #4,
  // Day 1 vs Day 2): if both titles carry some and they differ, not a dupe.
  const da = ta.filter((t) => DISCRIMINATORS.test(t)).sort().join(" ");
  const db = tb.filter((t) => DISCRIMINATORS.test(t)).sort().join(" ");
  if (da && db && da !== db) return 0;
  const ca = ta.join("");
  const cb = tb.join("");
  // Same name modulo spacing, stopwords kept ("RunWithTheSound" / "Run With The Sound").
  const ra = compactRaw(a);
  if ((ca.length >= 4 && ca === cb) || (ra.length >= 6 && ra === compactRaw(b))) return 1;
  return Math.max(jaccard(ta, tb), dice(ta.join(" "), tb.join(" ")), dice(ca, cb));
}

function venueSimilar(a: Row, b: Row): boolean {
  if (a.venue_id && b.venue_id && a.venue_id === b.venue_id) return true;
  const va = a.venue_name ? slugify(a.venue_name, 60) : "";
  const vb = b.venue_name ? slugify(b.venue_name, 60) : "";
  if (!va && !vb) return true;
  if (!va || !vb) return false;
  if (va === vb || va.includes(vb) || vb.includes(va)) return true;
  return jaccard(va.split("-"), vb.split("-")) >= 0.5;
}

function richness(r: Row): number {
  let s = 0;
  if (r.image_url) s += 3;
  if (r.description && r.description.length > 80) s += 2;
  else if (r.description) s += 1;
  if (r.featured) s += 5;
  for (const f of MERGE_FIELDS) if (r[f]) s += 1;
  s += Math.min((r.tags ?? []).length, 3) * 0.2;
  return s;
}

function pickKeeper(rows: Row[]): Row {
  const manual = (r: Row) => (r.source === "seed" || r.source === "manual" ? 1 : 0);
  return [...rows].sort(
    (a, b) =>
      richness(b) - richness(a) ||
      manual(b) - manual(a) ||
      Date.parse(a.created_at) - Date.parse(b.created_at),
  )[0];
}

// Union-find over row indices.
export function clusters(rows: Row[]): Row[][] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const keys = rows.map((r) => dedupeKey(r));
  // Pass 1: exact key.
  const byKey = new Map<string, number>();
  rows.forEach((r, i) => {
    if (!keys[i].split("|")[0]) return; // empty normalised title: never match on it
    const k = keys[i];
    if (byKey.has(k)) union(byKey.get(k)!, i);
    else byKey.set(k, i);
  });
  // Pass 2: fuzzy within the same Bangkok date.
  const byDate = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const d = bangkokDate(r.starts_at);
    (byDate.get(d) ?? byDate.set(d, []).get(d)!).push(i);
  });
  for (const idx of byDate.values()) {
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        const a = rows[idx[x]];
        const b = rows[idx[y]];
        if (find(idx[x]) === find(idx[y])) continue;
        if (!venueSimilar(a, b)) continue;
        if (titleSimilarity(a.title, b.title) >= 0.8) union(idx[x], idx[y]);
      }
    }
  }
  const groups = new Map<number, Row[]>();
  rows.forEach((r, i) => {
    const root = find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(r);
  });
  return [...groups.values()];
}

export async function runDedupe(ctx: JobContext): Promise<StepResult> {
  const stats = emptyStats();
  if (ctx.tablesMissing) return { status: "skipped", stats, summary: "bke_events missing" };
  const since = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
  const rows = await selectAll<Row>(
    (f, t) =>
      jobsDb()
        .from("bke_events")
        .select(COLS)
        .is("duplicate_of", null)
        .in("status", ["published", "cancelled"])
        .gte("starts_at", since)
        .order("starts_at")
        .range(f, t),
    "bke_events (dedupe)",
  );
  stats.fetched = rows.length;
  const sb = jobsDb();
  let keysUpdated = 0;

  for (const group of clusters(rows)) {
    if (group.length > 1) {
      const keeper = pickKeeper(group);
      const others = group.filter((r) => r.id !== keeper.id);
      const patch: Record<string, unknown> = {};
      for (const f of MERGE_FIELDS) {
        if (keeper[f]) continue;
        const donor = others.find((o) => o[f]);
        if (donor) patch[f] = donor[f];
      }
      const tags = Array.from(new Set(group.flatMap((r) => r.tags ?? []))).slice(0, 16);
      if (tags.length !== (keeper.tags ?? []).length) patch.tags = tags;
      const key = dedupeKey(keeper);
      if (keeper.dedupe_key !== key) patch.dedupe_key = key;
      ctx.log(`  = keep ${keeper.slug} ← ${others.map((o) => o.slug).join(", ")}${Object.keys(patch).length ? ` (fill ${Object.keys(patch).join(", ")})` : ""}`);
      stats.merged += others.length;
      if (Object.keys(patch).length) stats.updated++;
      if (!ctx.dryRun) {
        if (Object.keys(patch).length) {
          const { error } = await sb.from("bke_events").update(patch).eq("id", keeper.id);
          if (error) throw dbError(error, `merge into ${keeper.slug}`);
        }
        for (const o of others) {
          const { error } = await sb
            .from("bke_events")
            .update({ duplicate_of: keeper.id, status: "draft", dedupe_key: dedupeKey(o) })
            .eq("id", o.id)
            .is("duplicate_of", null);
          if (error) throw dbError(error, `link ${o.slug}`);
        }
      }
      continue;
    }
    const r = group[0];
    const key = dedupeKey(r);
    if (r.dedupe_key !== key) {
      keysUpdated++;
      if (!ctx.dryRun) {
        const { error } = await sb.from("bke_events").update({ dedupe_key: key }).eq("id", r.id);
        if (error) throw dbError(error, `dedupe_key ${r.slug}`);
      }
    }
  }
  stats.keys_updated = keysUpdated;
  return {
    status: "ok",
    stats,
    summary: `${rows.length} candidates: ${ctx.dryRun ? "would merge" : "merged"} ${stats.merged} duplicates into ${stats.updated} enriched keepers, ${keysUpdated} keys set`,
  };
}
