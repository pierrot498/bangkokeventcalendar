import Link from "next/link";
import { listEvents, listPosts } from "@/lib/queries";
import { bangkokWeekend } from "@/lib/datetime";
import { SPORT_CATEGORIES, TOP_CATEGORIES } from "@/lib/categories";
import { t } from "@/lib/i18n";
import EventGrid from "@/components/EventGrid";
import Section from "@/components/Section";
import CategoryTiles from "@/components/CategoryTiles";
import PostCard from "@/components/PostCard";
import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export const revalidate = 600;

export const metadata: Metadata = pageMetadata({
  title: `${t.site.name}: what's on in Bangkok`,
  description: t.site.description,
  path: "/",
});

export default async function HomePage() {
  const weekend = bangkokWeekend();
  const [weekendEvents, upcoming, sports, posts] = await Promise.all([
    listEvents({ start: weekend.start, end: weekend.end, limit: 8 }),
    listEvents({ limit: 12 }),
    listEvents({ category: "sports", limit: 8 }),
    listPosts(3),
  ]);

  return (
    <div className="space-y-14 pb-6">
      <section className="hero-bg border-b border-[color:var(--color-line)]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--color-brand-600)]">{t.home.heroKicker}</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">{t.home.heroTitle}</h1>
          <p className="mt-4 max-w-2xl text-lg text-[color:var(--color-ink-soft)]">{t.home.heroBody}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/events" className="rounded-xl bg-[color:var(--color-ink)] px-5 py-3 font-bold text-white hover:opacity-90">{t.home.browseAll}</Link>
            <Link href="/events?when=weekend" className="rounded-xl border border-[color:var(--color-line)] bg-white px-5 py-3 font-bold hover:border-[color:var(--color-ink)]">{t.home.thisWeekend}</Link>
            <a href="/api/calendar.ics" className="rounded-xl border border-[color:var(--color-line)] bg-white px-5 py-3 font-bold hover:border-[color:var(--color-ink)]">📅 {t.home.subscribe}</a>
          </div>
          <div className="mt-8">
            <CategoryTiles categories={TOP_CATEGORIES.filter((c) => c.slug !== "other")} compact />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4">
        <Section title={t.home.thisWeekend} href="/events?when=weekend">
          <EventGrid events={weekendEvents} />
        </Section>

        <Section title={t.home.upcoming} href="/events">
          <EventGrid events={upcoming} />
        </Section>

        <Section title={t.home.categories}>
          <CategoryTiles categories={TOP_CATEGORIES.filter((c) => c.slug !== "other")} />
        </Section>

        <Section title={t.home.sports} href="/sports">
          <CategoryTiles categories={SPORT_CATEGORIES} compact />
          {sports.length > 0 && <EventGrid events={sports} />}
        </Section>

        {posts.length > 0 && (
          <Section title={t.home.latestPosts} href="/blog">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
