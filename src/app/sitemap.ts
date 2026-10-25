import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { SPORT_CATEGORIES, TOP_CATEGORIES } from "@/lib/categories";
import { listEventSlugsForSitemap, listPosts, listVenueSlugs } from "@/lib/queries";
import { bangkokParts } from "@/lib/datetime";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [events, posts, venues] = await Promise.all([listEventSlugsForSitemap(), listPosts(1000), listVenueSlugs()]);
  const u = (path: string) => `${SITE_URL}${path}`;
  const statics: MetadataRoute.Sitemap = ["/", "/events", "/calendar", "/sports", "/blog", "/submit", "/sources"].map((p) => ({
    url: u(p),
    lastModified: now,
    changeFrequency: "daily",
    priority: p === "/" ? 1 : 0.8,
  }));
  const cats: MetadataRoute.Sitemap = [
    ...TOP_CATEGORIES.filter((c) => c.slug !== "sports").map((c) => ({ url: u(`/events/category/${c.slug}`), changeFrequency: "daily" as const, priority: 0.7 })),
    ...SPORT_CATEGORIES.map((c) => ({ url: u(`/sports/${c.slug}`), changeFrequency: "daily" as const, priority: 0.7 })),
  ];
  const p = bangkokParts(now);
  const months: MetadataRoute.Sitemap = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(p.year, p.month - 1 + i, 1));
    return { url: u(`/calendar/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`), changeFrequency: "daily" as const, priority: 0.6 };
  });
  return [
    ...statics,
    ...cats,
    ...months,
    ...events.map((e) => ({ url: u(`/events/${e.slug}`), lastModified: new Date(e.updated_at), changeFrequency: "weekly" as const, priority: 0.6 })),
    ...posts.map((post) => ({ url: u(`/blog/${post.slug}`), lastModified: new Date(post.updated_at), changeFrequency: "monthly" as const, priority: 0.5 })),
    ...venues.map((v) => ({ url: u(`/venues/${v.slug}`), lastModified: new Date(v.updated_at), changeFrequency: "weekly" as const, priority: 0.4 })),
  ];
}
