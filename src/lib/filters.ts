import { bangkokRange, type DateRangeKey } from "./datetime";
import { isSportSub, isTopCategory } from "./categories";
import type { EventQuery } from "./queries";

// URL search params for /events → validated filter state.
export type EventFilters = {
  category: string | null;
  sport: string | null;
  when: DateRangeKey | null;
  free: boolean;
  area: string | null;
  page: number;
};

const WHEN: DateRangeKey[] = ["today", "weekend", "week", "month"];

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

export function parseFilters(sp: SP): EventFilters {
  const category = one(sp.category);
  const sport = one(sp.sport);
  const when = one(sp.when);
  return {
    category: category && isTopCategory(category) ? category : null,
    sport: sport && isSportSub(sport) ? sport : null,
    when: when && (WHEN as string[]).includes(when) ? (when as DateRangeKey) : null,
    free: one(sp.free) === "1",
    area: one(sp.area)?.slice(0, 80) ?? null,
    page: Math.min(Math.max(1, Math.floor(Number(one(sp.page)) || 1)), 1000),
  };
}

export const PAGE_SIZE = 48;

export function filtersToQuery(f: EventFilters): EventQuery {
  const range = f.when ? bangkokRange(f.when) : null;
  return {
    category: f.sport ? "sports" : f.category,
    sub: f.sport,
    start: range?.start ?? null,
    end: range?.end ?? null,
    freeOnly: f.free,
    area: f.area,
    limit: PAGE_SIZE,
    offset: (f.page - 1) * PAGE_SIZE,
  };
}

export function filtersToHref(f: Partial<EventFilters>): string {
  const p = new URLSearchParams();
  if (f.category) p.set("category", f.category);
  if (f.sport) p.set("sport", f.sport);
  if (f.when) p.set("when", f.when);
  if (f.free) p.set("free", "1");
  if (f.area) p.set("area", f.area);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `/events?${s}` : "/events";
}
