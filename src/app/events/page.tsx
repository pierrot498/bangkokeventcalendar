import Link from "next/link";
import { listAreas, listEventsPage } from "@/lib/queries";
import { PAGE_SIZE, filtersToHref, filtersToQuery, parseFilters } from "@/lib/filters";
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
  const filtered = !!(f.category || f.sport || f.when || f.free || f.area || f.page > 1);
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
  const [{ rows: events, total }, areas] = await Promise.all([listEventsPage(filtersToQuery(filters)), listAreas()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t.events.title}</h1>
        <p className="mt-1 text-[color:var(--color-ink-soft)]">{t.events.intro}</p>
      </header>
      <EventFilters filters={filters} areas={areas} />
      <p className="text-sm font-semibold text-[color:var(--color-ink-soft)]">{t.events.resultCount(total)}{pages > 1 ? ` · ${t.events.pageOf(filters.page, pages)}` : ""}</p>
      <EventGrid events={events} />
      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3 pt-4 text-sm font-semibold">
          {filters.page > 1 && (
            <Link href={filtersToHref({ ...filters, page: filters.page - 1 })} className="rounded-lg border border-[color:var(--color-line)] bg-white px-4 py-2 hover:border-[color:var(--color-ink)]">← {t.events.prevPage}</Link>
          )}
          <span className="text-[color:var(--color-ink-soft)]">{t.events.pageOf(filters.page, pages)}</span>
          {filters.page < pages && (
            <Link href={filtersToHref({ ...filters, page: filters.page + 1 })} className="rounded-lg border border-[color:var(--color-line)] bg-white px-4 py-2 hover:border-[color:var(--color-ink)]">{t.events.nextPage} →</Link>
          )}
        </nav>
      )}
    </div>
  );
}
