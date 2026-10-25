import { listEvents } from "@/lib/queries";
import { SPORT_CATEGORIES, categoryName } from "@/lib/categories";
import { t } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import EventGrid from "@/components/EventGrid";
import CategoryTiles from "@/components/CategoryTiles";
import Section from "@/components/Section";
import type { Metadata } from "next";

export const revalidate = 600;

export const metadata: Metadata = pageMetadata({
  title: t.sports.title,
  description: t.sports.intro,
  path: "/sports",
});

export default async function SportsHub() {
  const events = await listEvents({ category: "sports", limit: 200 });
  const bySub = new Map<string, typeof events>();
  for (const e of events) {
    const k = e.subcategory_slug ?? "";
    (bySub.get(k) ?? bySub.set(k, []).get(k))!.push(e);
  }
  const subsWithEvents = SPORT_CATEGORIES.filter((c) => bySub.has(c.slug));
  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-10">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">🏅 {t.sports.title}</h1>
        <p className="mt-2 max-w-3xl text-[color:var(--color-ink-soft)]">{t.sports.intro}</p>
      </header>
      <CategoryTiles categories={SPORT_CATEGORIES} />
      {events.length === 0 && <EventGrid events={[]} />}
      {subsWithEvents.map((c) => (
        <Section key={c.slug} title={`${c.emoji} ${categoryName(c.slug)}`} href={`/sports/${c.slug}`}>
          <EventGrid events={bySub.get(c.slug)!.slice(0, 8)} />
        </Section>
      ))}
      {bySub.has("") && (
        <Section title={t.sports.allSports}>
          <EventGrid events={bySub.get("")!.slice(0, 8)} />
        </Section>
      )}
    </div>
  );
}
