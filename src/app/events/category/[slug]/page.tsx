import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { listEvents } from "@/lib/queries";
import { TOP_CATEGORIES, categoryBlurb, categoryName, getCategory, isSportSub, isTopCategory } from "@/lib/categories";
import { t } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import EventGrid from "@/components/EventGrid";
import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";

export const revalidate = 600;

export function generateStaticParams() {
  return TOP_CATEGORIES.filter((c) => c.slug !== "sports").map((c) => ({ slug: c.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isTopCategory(slug)) return {};
  return pageMetadata({
    title: t.category.titleFor(categoryName(slug)),
    description: categoryBlurb(slug),
    path: `/events/category/${slug}`,
  });
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  if (slug === "sports") permanentRedirect("/sports");
  if (isSportSub(slug)) permanentRedirect(`/sports/${slug}`);
  if (!isTopCategory(slug)) notFound();
  const c = getCategory(slug)!;
  const events = await listEvents({ category: slug, limit: 120 });
  const name = categoryName(slug);
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: t.nav.events, item: absoluteUrl("/events") },
            { "@type": "ListItem", position: 2, name, item: absoluteUrl(`/events/category/${slug}`) },
          ],
        }}
      />
      <header>
        <p className="text-sm font-semibold text-[color:var(--color-ink-soft)]">
          <Link href="/events" className="hover:underline">{t.nav.events}</Link> /
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          <span aria-hidden>{c.emoji}</span> {t.category.titleFor(name)}
        </h1>
        <p className="mt-2 max-w-2xl text-[color:var(--color-ink-soft)]">{categoryBlurb(slug)}</p>
      </header>
      <EventGrid events={events} />
    </div>
  );
}
