import { listAreas, listEvents } from "@/lib/queries";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { categoryName } from "@/lib/categories";
import { t } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import EventGrid from "@/components/EventGrid";
import EventFilters from "@/components/EventFilters";
import type { Metadata } from "next";

// searchParams make this page dynamic; the queries themselves are cheap.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters(await searchParams);
  const filtered = !!(f.category || f.sport || f.when || f.free || f.area);
  const name = f.sport ? categoryName(f.sport) : f.category ? categoryName(f.category) : null;
  return pageMetadata({
    title: name ? t.category.titleFor(name) : t.events.title,
    description: `${t.events.title}: ${t.site.description}`,
    path: "/events",
    // Filter combinations are canonicalised to /events and not indexed;
    // the category / sport landing pages are the indexable versions.
    noindex: filtered,
  });
}

export default async function EventsPage({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  const [events, areas] = await Promise.all([listEvents(filtersToQuery(filters)), listAreas()]);
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t.events.title}</h1>
        <p className="mt-1 text-[color:var(--color-ink-soft)]">{t.events.intro}</p>
      </header>
      <EventFilters filters={filters} areas={areas} />
      <p className="text-sm font-semibold text-[color:var(--color-ink-soft)]">{t.events.resultCount(events.length)}</p>
      <EventGrid events={events} />
    </div>
  );
}
