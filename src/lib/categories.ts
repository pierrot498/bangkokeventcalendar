// Static category registry. Mirrors the bke_categories seed in
// supabase/migrations/0001_init.sql (slugs MUST match). The site renders
// navigation, tiles, colours and emoji from this list so pages work even
// before the tables exist. Display names live in src/lib/i18n.ts.

import { t } from "./i18n";

export type CategoryDef = {
  slug: string;
  parent: string | null;
  emoji: string;
  // Gradient used as the card fallback when an event has no image.
  from: string;
  to: string;
};

export const TOP_CATEGORIES: CategoryDef[] = [
  { slug: "concerts", parent: null, emoji: "🎤", from: "#7c3aed", to: "#db2777" },
  { slug: "nightlife", parent: null, emoji: "🪩", from: "#1e1b4b", to: "#7e22ce" },
  { slug: "food-drink", parent: null, emoji: "🍜", from: "#f97316", to: "#facc15" },
  { slug: "art-culture", parent: null, emoji: "🎨", from: "#0ea5e9", to: "#a855f7" },
  { slug: "markets", parent: null, emoji: "🛍️", from: "#16a34a", to: "#a3e635" },
  { slug: "festivals", parent: null, emoji: "🎉", from: "#ef4444", to: "#f59e0b" },
  { slug: "family", parent: null, emoji: "🧸", from: "#06b6d4", to: "#84cc16" },
  { slug: "business-tech", parent: null, emoji: "💼", from: "#334155", to: "#2563eb" },
  { slug: "wellness", parent: null, emoji: "🌿", from: "#059669", to: "#5eead4" },
  { slug: "sports", parent: null, emoji: "🏅", from: "#dc2626", to: "#f97316" },
  { slug: "other", parent: null, emoji: "✨", from: "#64748b", to: "#94a3b8" },
];

export const SPORT_CATEGORIES: CategoryDef[] = [
  { slug: "running", parent: "sports", emoji: "🏃", from: "#ff5a1f", to: "#fb923c" },
  { slug: "padel", parent: "sports", emoji: "🎾", from: "#0d9488", to: "#a3e635" },
  { slug: "cycling", parent: "sports", emoji: "🚴", from: "#1d4ed8", to: "#22d3ee" },
  { slug: "triathlon", parent: "sports", emoji: "🏊", from: "#0369a1", to: "#f97316" },
  { slug: "hyrox", parent: "sports", emoji: "🏋️", from: "#111827", to: "#facc15" },
  { slug: "football", parent: "sports", emoji: "⚽", from: "#15803d", to: "#4ade80" },
  { slug: "muay-thai", parent: "sports", emoji: "🥊", from: "#991b1b", to: "#ef4444" },
  { slug: "yoga", parent: "sports", emoji: "🧘", from: "#a21caf", to: "#f0abfc" },
  { slug: "golf", parent: "sports", emoji: "⛳", from: "#166534", to: "#bef264" },
  { slug: "tennis", parent: "sports", emoji: "🎾", from: "#65a30d", to: "#fde047" },
  { slug: "pickleball", parent: "sports", emoji: "🏓", from: "#0891b2", to: "#fde68a" },
  { slug: "basketball", parent: "sports", emoji: "🏀", from: "#c2410c", to: "#fdba74" },
  { slug: "swimming", parent: "sports", emoji: "🏊", from: "#0284c7", to: "#7dd3fc" },
  { slug: "climbing", parent: "sports", emoji: "🧗", from: "#78350f", to: "#d97706" },
];

export const ALL_CATEGORIES: CategoryDef[] = [...TOP_CATEGORIES, ...SPORT_CATEGORIES];

const BY_SLUG = new Map(ALL_CATEGORIES.map((c) => [c.slug, c]));

export function getCategory(slug: string | null | undefined): CategoryDef | null {
  return slug ? (BY_SLUG.get(slug) ?? null) : null;
}

export function isTopCategory(slug: string): boolean {
  return BY_SLUG.get(slug)?.parent === null;
}

export function isSportSub(slug: string): boolean {
  return BY_SLUG.get(slug)?.parent === "sports";
}

export function categoryName(slug: string | null | undefined): string {
  if (!slug) return "";
  return (t.categories as Record<string, string>)[slug] ?? slug;
}

export function categoryBlurb(slug: string): string {
  return (t.categoryBlurbs as Record<string, string>)[slug] ?? "";
}

// The most specific visual for an event: its sport subcategory first.
export function eventVisual(category: string, sub?: string | null): CategoryDef {
  return getCategory(sub) ?? getCategory(category) ?? TOP_CATEGORIES[TOP_CATEGORIES.length - 1];
}

export function gradientStyle(c: CategoryDef): { backgroundImage: string } {
  return { backgroundImage: `linear-gradient(135deg, ${c.from} 0%, ${c.to} 100%)` };
}

// Common alternative spellings seen in seed files / sources → canonical slug.
export const CATEGORY_ALIASES: Record<string, string> = {
  music: "concerts",
  concert: "concerts",
  "live-music": "concerts",
  gigs: "concerts",
  "arts-culture": "art-culture",
  arts: "art-culture",
  art: "art-culture",
  culture: "art-culture",
  food: "food-drink",
  drink: "food-drink",
  "food-and-drink": "food-drink",
  party: "nightlife",
  parties: "nightlife",
  market: "markets",
  festival: "festivals",
  kids: "family",
  business: "business-tech",
  tech: "business-tech",
  sport: "sports",
  "hyrox-fitness": "hyrox",
  fitness: "hyrox",
  crossfit: "hyrox",
  run: "running",
  bike: "cycling",
  "muay thai": "muay-thai",
  muaythai: "muay-thai",
  soccer: "football",
};

export function canonicalCategorySlug(slug: string | null | undefined): string {
  const s = (slug ?? "").trim().toLowerCase();
  return CATEGORY_ALIASES[s] ?? s;
}

// Normalise a (category, subcategory) pair coming from seed files / jobs:
// a sport slug given as the category becomes sports + that sub; unknown
// slugs fall back to "other".
export function normalizeCategory(
  category: string | null | undefined,
  sub?: string | null,
): { category_slug: string; subcategory_slug: string | null } {
  const c = canonicalCategorySlug(category);
  const s = canonicalCategorySlug(sub);
  if (isSportSub(c)) return { category_slug: "sports", subcategory_slug: c };
  if (isTopCategory(c)) {
    return {
      category_slug: c,
      subcategory_slug: c === "sports" && isSportSub(s) ? s : null,
    };
  }
  if (isSportSub(s)) return { category_slug: "sports", subcategory_slug: s };
  return { category_slug: "other", subcategory_slug: null };
}
