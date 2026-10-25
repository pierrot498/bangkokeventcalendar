// Seed loader: upserts data/seed/{events.json, sources.json, blog/*.md} into
// the bke_ tables by slug, using the service-role key from .env.local.
//
//   npm run seed                 # everything
//   npm run seed -- --dry-run    # validate + print, write nothing
//   npm run seed -- events       # only some of: events sources blog
//
// Never prints env values. Exits 1 with a clear message if the tables don't
// exist yet (run supabase/migrations/0001_init.sql in the SQL editor first).
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { slugify } from "../src/lib/slug";
import { ALL_CATEGORIES, canonicalCategorySlug, normalizeCategory } from "../src/lib/categories";

const ROOT = path.resolve(__dirname, "..");
const SEED_DIR = path.join(ROOT, "data", "seed");
const envFile = path.join(ROOT, ".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--"));
const want = (k: string) => only.length === 0 || only.includes(k);

const MIGRATION_HINT =
  "Tables missing: the bke_ tables don't exist yet. Run supabase/migrations/0001_init.sql in the Supabase SQL editor, then re-run `npm run seed`.";

// --- validation ------------------------------------------------------------

const blank = (v: unknown) => (v === "" ? undefined : v);
const optStr = z.preprocess(blank, z.string().trim().nullable().optional());
const optUrl = z.preprocess(blank, z.string().trim().url().nullable().optional());
const isoWithOffset = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "not a valid date" })
  .refine((s) => /T.*(Z|[+-]\d{2}:?\d{2})$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s), {
    message: "use ISO with offset, e.g. 2026-11-01T19:00:00+07:00 (or YYYY-MM-DD for all-day)",
  });

const SeedEvent = z.object({
  slug: z.string().trim().min(2).optional(),
  title: z.string().trim().min(2),
  summary: optStr,
  description: optStr,
  category: z.string().trim().min(1),
  subcategory: optStr,
  tags: z.array(z.string()).optional().default([]),
  starts_at: isoWithOffset,
  ends_at: z.preprocess(blank, isoWithOffset.nullable().optional()),
  all_day: z.boolean().optional().default(false),
  venue_name: optStr,
  area: optStr,
  address: optStr,
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  price_text: optStr,
  is_free: z.boolean().optional().default(false),
  ticket_url: optUrl,
  source_url: optUrl,
  image_url: optUrl,
  organizer: optStr,
  featured: z.boolean().optional().default(false),
  status: z.enum(["published", "draft", "cancelled"]).optional(),
});

const SeedSource = z.object({
  name: z.string().trim().min(1),
  url: z.string().trim().url(),
  kind: optStr,
  category: optStr,
  notes: optStr,
  feed_url: optUrl,
  fetch_mode: z.enum(["auto", "jsonld", "ical", "ai", "none"]).optional(),
});

const SeedPost = z.object({
  slug: z.string().trim().min(2),
  title: z.string().trim().min(2),
  description: optStr,
  published_at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "invalid published_at" }),
  tags: z.array(z.string()).optional().default([]),
  category: optStr,
  cover_image_url: optUrl,
  status: z.enum(["published", "draft"]).optional(),
});

// --- helpers ---------------------------------------------------------------

function readJsonArray(file: string): unknown[] {
  if (!fs.existsSync(file)) {
    console.log(`  (skip) ${path.relative(ROOT, file)} not found`);
    return [];
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(data)) throw new Error(`${path.relative(ROOT, file)} must be a JSON array`);
  return data;
}

// Date-only "YYYY-MM-DD" → Bangkok midnight.
function toIso(s: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00+07:00`).toISOString() : new Date(s).toISOString();
}

// Minimal YAML-frontmatter parser: `key: value`, quoted strings,
// inline arrays `[a, "b"]` and block lists (`- item`).
export function parseFrontmatter(src: string): { data: Record<string, unknown>; body: string } {
  const m = src.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data: Record<string, unknown> = {};
  const unquote = (v: string) => {
    const s = v.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
    return s;
  };
  let listKey: string | null = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const item = raw.match(/^\s+-\s+(.*)$/) ?? raw.match(/^-\s+(.*)$/);
    if (item && listKey) {
      (data[listKey] as string[]).push(unquote(item[1]));
      continue;
    }
    const kv = raw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    listKey = null;
    if (value === "") {
      data[key] = [];
      listKey = key;
    } else if (value.trim().startsWith("[") && value.trim().endsWith("]")) {
      data[key] = value
        .trim()
        .slice(1, -1)
        .split(",")
        .map(unquote)
        .filter(Boolean);
    } else if (value.trim() === "true" || value.trim() === "false") {
      data[key] = value.trim() === "true";
    } else {
      data[key] = unquote(value);
    }
  }
  // Empty `key:` that never got list items → null.
  for (const [k, v] of Object.entries(data)) if (Array.isArray(v) && v.length === 0 && k !== "tags") data[k] = null;
  return { data, body: m[2] };
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /does not exist|Could not find the table|schema cache/i.test(err.message ?? "");
}

async function assertTables(sb: SupabaseClient) {
  for (const table of ["bke_categories", "bke_venues", "bke_events", "bke_posts", "bke_sources"]) {
    const { error } = await sb.from(table).select("*", { head: true, count: "exact" }).limit(1);
    if (error) {
      if (isMissingTable(error)) {
        console.error(`\n✗ ${MIGRATION_HINT}\n  (first missing table: ${table})`);
        process.exit(1);
      }
      throw new Error(`${table}: ${error.message}`);
    }
  }
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// --- loaders ---------------------------------------------------------------

type Stats = { ok: number; skipped: number; errors: string[] };

async function seedEvents(sb: SupabaseClient | null): Promise<Stats> {
  const stats: Stats = { ok: 0, skipped: 0, errors: [] };
  const raw = readJsonArray(path.join(SEED_DIR, "events.json"));
  type Row = Record<string, unknown> & { slug: string };
  const rows: Row[] = [];
  const venues = new Map<string, Record<string, unknown>>();
  const seen = new Set<string>();

  raw.forEach((item, i) => {
    const p = SeedEvent.safeParse(item);
    if (!p.success) {
      stats.skipped++;
      stats.errors.push(`events[${i}] ${(item as { slug?: string })?.slug ?? ""}: ${p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
      return;
    }
    const e = p.data;
    const starts = toIso(e.starts_at);
    const slug = slugify(e.slug ?? `${e.title}-${starts.slice(0, 10)}`, 100);
    if (seen.has(slug)) {
      stats.skipped++;
      stats.errors.push(`events[${i}] duplicate slug "${slug}" in file`);
      return;
    }
    seen.add(slug);
    const cat = normalizeCategory(e.category, e.subcategory);
    if (cat.category_slug === "other" && canonicalCategorySlug(e.category) !== "other") {
      stats.errors.push(`events[${i}] ${slug}: unknown category "${e.category}" → stored as "other"`);
    }
    const venueSlug = e.venue_name ? slugify(e.venue_name) : null;
    if (venueSlug && e.venue_name) {
      const prev = venues.get(venueSlug) ?? {};
      venues.set(venueSlug, {
        slug: venueSlug,
        name: e.venue_name,
        area: prev.area ?? e.area ?? null,
        address: prev.address ?? e.address ?? null,
        lat: prev.lat ?? e.lat ?? null,
        lng: prev.lng ?? e.lng ?? null,
      });
    }
    rows.push({
      slug,
      title: e.title,
      summary: e.summary ?? null,
      description: e.description ?? null,
      ...cat,
      tags: e.tags.map((t) => t.trim()).filter(Boolean),
      starts_at: starts,
      ends_at: e.ends_at ? toIso(e.ends_at) : null,
      all_day: e.all_day || /^\d{4}-\d{2}-\d{2}$/.test(e.starts_at),
      timezone: "Asia/Bangkok",
      venue_name: e.venue_name ?? null,
      area: e.area ?? null,
      address: e.address ?? null,
      price_text: e.price_text ?? null,
      is_free: e.is_free,
      ticket_url: e.ticket_url ?? null,
      source_url: e.source_url ?? null,
      image_url: e.image_url ?? null,
      organizer: e.organizer ?? null,
      featured: e.featured,
      source: "seed",
      last_seen_at: new Date().toISOString(),
      _venue: venueSlug,
      _status: e.status ?? "published",
    });
  });

  console.log(`events: ${rows.length} valid, ${stats.skipped} skipped, ${venues.size} venues`);
  if (!sb) {
    stats.ok = rows.length;
    return stats;
  }

  // Venues first (upsert by slug), then map slug → id. Existing venue
  // fields are only overwritten by non-null seed values.
  const venueIds = new Map<string, string>();
  for (const batch of chunk([...venues.values()], 200)) {
    const { data: existing, error: exErr } = await sb.from("bke_venues").select("slug, area, address, lat, lng").in("slug", batch.map((v) => v.slug as string));
    if (exErr) throw new Error(`bke_venues read: ${exErr.message}`);
    const ex = new Map((existing ?? []).map((v) => [v.slug as string, v as Record<string, unknown>]));
    const merged = batch.map((v) => {
      const o = ex.get(v.slug as string);
      if (!o) return v;
      return { ...v, area: v.area ?? o.area, address: v.address ?? o.address, lat: v.lat ?? o.lat, lng: v.lng ?? o.lng };
    });
    const { data, error } = await sb.from("bke_venues").upsert(merged, { onConflict: "slug" }).select("id, slug");
    if (error) throw new Error(`bke_venues upsert: ${error.message}`);
    for (const v of data ?? []) venueIds.set(v.slug as string, v.id as string);
  }

  // Existing events: keep their status if the dedupe job marked them as a
  // duplicate (duplicate_of set) so a re-seed doesn't resurrect them.
  for (const batch of chunk(rows, 200)) {
    const { data: existing, error: exErr } = await sb.from("bke_events").select("slug, duplicate_of").in("slug", batch.map((r) => r.slug));
    if (exErr) throw new Error(`bke_events read: ${exErr.message}`);
    const dupes = new Set((existing ?? []).filter((r) => r.duplicate_of).map((r) => r.slug as string));
    const fresh: Record<string, unknown>[] = [];
    const keepStatus: Record<string, unknown>[] = [];
    for (const r of batch) {
      const { _venue, _status, ...row } = r;
      const out = { ...row, venue_id: _venue ? (venueIds.get(_venue as string) ?? null) : null };
      if (dupes.has(r.slug)) keepStatus.push(out);
      else fresh.push({ ...out, status: _status });
    }
    for (const group of [fresh, keepStatus]) {
      if (!group.length) continue;
      const { error } = await sb.from("bke_events").upsert(group, { onConflict: "slug" });
      if (error) {
        stats.errors.push(`bke_events upsert: ${error.message}`);
        continue;
      }
      stats.ok += group.length;
    }
  }
  return stats;
}

async function seedSources(sb: SupabaseClient | null): Promise<Stats> {
  const stats: Stats = { ok: 0, skipped: 0, errors: [] };
  const raw = readJsonArray(path.join(SEED_DIR, "sources.json"));
  const known = new Set(ALL_CATEGORIES.map((c) => c.slug));
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const p = SeedSource.safeParse(item);
    if (!p.success) {
      stats.skipped++;
      stats.errors.push(`sources[${i}]: ${p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
      return;
    }
    const s = p.data;
    let slug = slugify(s.name);
    for (let n = 2; seen.has(slug); n++) slug = `${slugify(s.name)}-${n}`;
    seen.add(slug);
    const cat = s.category ? canonicalCategorySlug(s.category) : null;
    rows.push({
      slug,
      name: s.name,
      url: s.url,
      kind: s.kind ?? null,
      category_slug: cat && known.has(cat) ? cat : null,
      notes: s.notes ?? null,
      ...(s.feed_url !== undefined ? { feed_url: s.feed_url } : {}),
      ...(s.fetch_mode ? { fetch_mode: s.fetch_mode } : {}),
    });
  });
  console.log(`sources: ${rows.length} valid, ${stats.skipped} skipped`);
  if (!sb) {
    stats.ok = rows.length;
    return stats;
  }
  // Uniform key sets per upsert batch (PostgREST bulk requirement).
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const k = Object.keys(r).sort().join(",");
    (groups.get(k) ?? groups.set(k, []).get(k))!.push(r);
  }
  for (const group of groups.values()) {
    for (const batch of chunk(group, 200)) {
      const { error } = await sb.from("bke_sources").upsert(batch, { onConflict: "slug" });
      if (error) stats.errors.push(`bke_sources upsert: ${error.message}`);
      else stats.ok += batch.length;
    }
  }
  return stats;
}

async function seedBlog(sb: SupabaseClient | null): Promise<Stats> {
  const stats: Stats = { ok: 0, skipped: 0, errors: [] };
  const dir = path.join(SEED_DIR, "blog");
  if (!fs.existsSync(dir)) {
    console.log("  (skip) data/seed/blog not found");
    return stats;
  }
  const rows: Record<string, unknown>[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    const { data, body } = parseFrontmatter(fs.readFileSync(path.join(dir, file), "utf8"));
    if (!data.slug) data.slug = file.replace(/\.md$/, "");
    if (typeof data.tags === "string") data.tags = (data.tags as string).split(",").map((s) => s.trim()).filter(Boolean);
    const p = SeedPost.safeParse(data);
    if (!p.success) {
      stats.skipped++;
      stats.errors.push(`blog/${file}: ${p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
      continue;
    }
    const post = p.data;
    rows.push({
      slug: slugify(post.slug, 120),
      title: post.title,
      description: post.description ?? null,
      body_md: body.trim(),
      cover_image_url: post.cover_image_url ?? null,
      tags: post.tags,
      category: post.category ?? null,
      published_at: toIso(post.published_at),
      status: post.status ?? "published",
    });
  }
  console.log(`blog: ${rows.length} valid, ${stats.skipped} skipped`);
  if (!sb) {
    stats.ok = rows.length;
    return stats;
  }
  for (const batch of chunk(rows, 100)) {
    const { error } = await sb.from("bke_posts").upsert(batch, { onConflict: "slug" });
    if (error) stats.errors.push(`bke_posts upsert: ${error.message}`);
    else stats.ok += batch.length;
  }
  return stats;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let sb: SupabaseClient | null = null;
  if (!DRY) {
    if (!url || !key) {
      console.error("✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (in .env.local).");
      process.exit(1);
    }
    sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    await assertTables(sb);
  } else {
    console.log("[dry-run] validating seed files only; nothing is written");
  }

  const results: [string, Stats][] = [];
  if (want("sources")) results.push(["sources", await seedSources(sb)]);
  if (want("events")) results.push(["events", await seedEvents(sb)]);
  if (want("blog")) results.push(["blog", await seedBlog(sb)]);

  let failed = false;
  console.log("");
  for (const [name, s] of results) {
    console.log(`${s.errors.some((e) => e.includes("upsert")) ? "✗" : "✓"} ${name}: ${DRY ? "valid" : "upserted"} ${s.ok}, skipped ${s.skipped}`);
    for (const e of s.errors.slice(0, 25)) console.log(`    - ${e}`);
    if (s.errors.length > 25) console.log(`    … ${s.errors.length - 25} more`);
    if (s.errors.some((e) => e.includes("upsert"))) failed = true;
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/does not exist|Could not find the table|schema cache/i.test(msg)) {
    console.error(`✗ ${MIGRATION_HINT}`);
  } else {
    console.error(`✗ seed failed: ${msg}`);
  }
  process.exit(1);
});
