import { notFound } from "next/navigation";
import Link from "next/link";
import { listEvents } from "@/lib/queries";
import { SPORT_CATEGORIES, categoryBlurb, categoryName, getCategory, isSportSub } from "@/lib/categories";
import { t } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import EventGrid from "@/components/EventGrid";
import CategoryTiles from "@/components/CategoryTiles";
import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";

export const revalidate = 600;

export function generateStaticParams() {
  return SPORT_CATEGORIES.map((c) => ({ sub: c.slug }));
}

type Props = { params: Promise<{ sub: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sub } = await params;
  if (!isSportSub(sub)) return {};
  return pageMetadata({
    title: t.category.titleFor(categoryName(sub)),
    description: categoryBlurb(sub),
    path: `/sports/${sub}`,
  });
}

export default async function SportPage({ params }: Props) {
  const { sub } = await params;
  if (!isSportSub(sub)) notFound();
  const c = getCategory(sub)!;
  const name = categoryName(sub);
  const events = await listEvents({ category: "sports", sub, limit: 120 });
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: t.nav.sports, item: absoluteUrl("/sports") },
            { "@type": "ListItem", position: 2, name, item: absoluteUrl(`/sports/${sub}`) },
          ],
        }}
      />
      <header>
        <p className="text-sm font-semibold text-[color:var(--color-ink-soft)]">
          <Link href="/sports" className="hover:underline">{t.nav.sports}</Link> /
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          <span aria-hidden>{c.emoji}</span> {t.category.titleFor(name)}
        </h1>
        <p className="mt-2 max-w-2xl text-[color:var(--color-ink-soft)]">{categoryBlurb(sub)}</p>
      </header>
      <EventGrid events={events} />
      {events.length >= 120 && (
        <p className="text-center">
          <Link href={`/events?sport=${sub}`} className="inline-block rounded-lg border border-[color:var(--color-line)] bg-white px-4 py-2 text-sm font-semibold hover:border-[color:var(--color-ink)]">{t.events.seeAllIn(name)} →</Link>
        </p>
      )}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">{t.sports.allSports}</h2>
        <CategoryTiles categories={SPORT_CATEGORIES.filter((s) => s.slug !== sub)} compact />
      </div>
    </div>
  );
}
