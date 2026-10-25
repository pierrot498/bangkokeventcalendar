import { notFound } from "next/navigation";
import Link from "next/link";
import { getEventBySlug, getVenueById, listEvents } from "@/lib/queries";
import { decodeSlug, hostOf, safeHttpUrl } from "@/lib/url";
import { categoryName, eventVisual, gradientStyle } from "@/lib/categories";
import { formatWhen, locationLine } from "@/lib/event-format";
import { googleCalendarUrl } from "@/lib/ics";
import { markdownToText, renderMarkdown } from "@/lib/markdown";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { bangkokDate } from "@/lib/datetime";
import { t } from "@/lib/i18n";
import EventGrid from "@/components/EventGrid";
import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";
import type { EventRow, VenueRow } from "@/lib/supabase/types";

export const revalidate = 900;

// Rendered on first request, then cached (ISR).
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = decodeSlug((await params).slug);
  const e = await getEventBySlug(slug);
  if (!e) return { title: t.notFound.title, robots: { index: false } };
  const when = formatWhen(e, { long: true });
  const where = locationLine(e);
  const desc = e.summary || markdownToText(e.description, 160) || `${e.title}, ${when}${where ? ` at ${where}` : ""}, Bangkok.`;
  return pageMetadata({
    title: `${e.title} (${formatWhen({ ...e, all_day: true, ends_at: null })})`,
    description: desc.slice(0, 200),
    path: `/events/${e.slug}`,
    image: safeHttpUrl(e.image_url),
    type: "article",
    modifiedTime: e.updated_at,
  });
}

function eventJsonLd(e: EventRow, venue: VenueRow | null, url: string) {
  const ticket = safeHttpUrl(e.ticket_url);
  const img = safeHttpUrl(e.image_url);
  const dateOnly = (iso: string) => bangkokDate(iso);
  return {
    "@context": "https://schema.org",
    "@type": e.category_slug === "sports" ? "SportsEvent" : "Event",
    name: e.title,
    description: e.summary || markdownToText(e.description, 500) || undefined,
    startDate: e.all_day ? dateOnly(e.starts_at) : e.starts_at,
    endDate: e.ends_at ? (e.all_day ? dateOnly(e.ends_at) : e.ends_at) : undefined,
    eventStatus: e.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    image: img ? [img] : undefined,
    url,
    location: {
      "@type": "Place",
      name: venue?.name ?? e.venue_name ?? "Bangkok",
      address: {
        "@type": "PostalAddress",
        ...((venue?.address ?? e.address) ? { streetAddress: venue?.address ?? e.address } : {}),
        addressLocality: e.area ? `${e.area}, Bangkok` : "Bangkok",
        addressRegion: "Bangkok",
        addressCountry: "TH",
      },
      ...(venue?.lat != null && venue?.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: venue.lat, longitude: venue.lng } } : {}),
    },
    ...(e.organizer ? { organizer: { "@type": "Organization", name: e.organizer } } : {}),
    ...(e.is_free
      ? { isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "THB", ...(ticket ? { url: ticket } : {}) } }
      : ticket
        ? { offers: { "@type": "Offer", url: ticket, ...(priceNumber(e.price_text) != null ? { price: priceNumber(e.price_text), priceCurrency: "THB" } : {}) } }
        : {}),
  };
}

// "฿1,200" / "1200 THB" / "From 500 baht" → 1200 / 500; anything else → null.
function priceNumber(text: string | null): number | null {
  if (!text) return null;
  const m = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export default async function EventPage({ params }: Props) {
  const slug = decodeSlug((await params).slug);
  const e = await getEventBySlug(slug);
  if (!e) notFound();

  const [venue, relatedSame, relatedCat] = await Promise.all([
    e.venue_id ? getVenueById(e.venue_id) : Promise.resolve(null),
    listEvents(e.subcategory_slug ? { category: e.category_slug, sub: e.subcategory_slug, excludeId: e.id, limit: 8 } : { category: e.category_slug, excludeId: e.id, limit: 8 }),
    e.subcategory_slug ? listEvents({ category: e.category_slug, excludeId: e.id, limit: 8 }) : Promise.resolve([] as EventRow[]),
  ]);
  const related = [...relatedSame, ...relatedCat.filter((r) => !relatedSame.some((s) => s.id === r.id))].slice(0, 8);

  const url = absoluteUrl(`/events/${e.slug}`);
  const visual = eventVisual(e.category_slug, e.subcategory_slug);
  const img = safeHttpUrl(e.image_url);
  const ticket = safeHttpUrl(e.ticket_url);
  const source = safeHttpUrl(e.source_url);
  const where = [venue?.name ?? e.venue_name, e.address ?? venue?.address, e.area].filter(Boolean).join(", ");
  const gcal = googleCalendarUrl({
    uid: e.slug,
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    allDay: e.all_day,
    description: e.summary ?? markdownToText(e.description, 800),
    location: where ? `${where}, Bangkok` : "Bangkok",
    url,
  });
  const html = renderMarkdown(e.description);
  const catHref = e.category_slug === "sports" ? "/sports" : `/events/category/${e.category_slug}`;

  return (
    <article className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd data={eventJsonLd(e, venue, url)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: t.nav.events, item: absoluteUrl("/events") },
            { "@type": "ListItem", position: 2, name: categoryName(e.category_slug), item: absoluteUrl(catHref) },
            ...(e.subcategory_slug ? [{ "@type": "ListItem", position: 3, name: categoryName(e.subcategory_slug), item: absoluteUrl(`/sports/${e.subcategory_slug}`) }] : []),
            { "@type": "ListItem", position: e.subcategory_slug ? 4 : 3, name: e.title, item: url },
          ],
        }}
      />
      <nav className="mb-4 text-sm font-semibold text-[color:var(--color-ink-soft)]">
        <Link href="/events" className="hover:underline">{t.nav.events}</Link>
        {" / "}
        <Link href={catHref} className="hover:underline">{categoryName(e.category_slug)}</Link>
        {e.subcategory_slug && (
          <>
            {" / "}
            <Link href={`/sports/${e.subcategory_slug}`} className="hover:underline">{categoryName(e.subcategory_slug)}</Link>
          </>
        )}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative aspect-square overflow-hidden rounded-3xl lg:sticky lg:top-20 lg:self-start" style={img ? undefined : gradientStyle(visual)}>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={e.title} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-[8rem]" aria-hidden>{visual.emoji}</div>
          )}
        </div>

        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <span className="pill bg-[color:var(--color-ink)] text-white">{visual.emoji} {categoryName(e.subcategory_slug ?? e.category_slug)}</span>
            {e.status === "cancelled" && <span className="pill bg-red-600 text-white">{t.events.cancelled}</span>}
            {e.is_free && <span className="pill bg-emerald-500 text-white">{t.events.free}</span>}
            {e.featured && <span className="pill bg-[color:var(--color-brand)] text-white">{t.events.featured}</span>}
          </div>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{e.title}</h1>
          {e.summary && <p className="text-lg text-[color:var(--color-ink-soft)]">{e.summary}</p>}

          <dl className="card divide-y divide-[color:var(--color-line)] text-sm">
            <Fact label={t.events.when}>{formatWhen(e, { long: true })}{e.all_day ? ` (${t.events.allDay})` : ""}</Fact>
            {where && (
              <Fact label={t.events.where}>
                {where}
                {venue && (
                  <>
                    {" · "}
                    <Link href={`/venues/${venue.slug}`} className="font-semibold text-[color:var(--color-brand-600)] hover:underline">{t.events.viewVenue}</Link>
                  </>
                )}
              </Fact>
            )}
            {(e.price_text || e.is_free) && <Fact label={t.events.price}>{e.is_free ? t.events.free : e.price_text}</Fact>}
            {e.organizer && <Fact label={t.events.organizer}>{e.organizer}</Fact>}
          </dl>

          <div className="flex flex-wrap gap-2">
            {ticket && (
              <a href={ticket} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[color:var(--color-brand)] px-5 py-3 font-bold text-white hover:bg-[color:var(--color-brand-600)]">
                {t.events.tickets} ↗
              </a>
            )}
            <a href={gcal} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-[color:var(--color-line)] bg-white px-4 py-3 text-sm font-bold hover:border-[color:var(--color-ink)]">
              {t.events.addGoogle}
            </a>
            <a href={`/api/events/${encodeURIComponent(e.slug)}/ics`} className="rounded-xl border border-[color:var(--color-line)] bg-white px-4 py-3 text-sm font-bold hover:border-[color:var(--color-ink)]">
              {t.events.downloadIcs}
            </a>
          </div>

          {html && <div className="prose-bke" dangerouslySetInnerHTML={{ __html: html }} />}

          {e.tags && e.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {e.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-[color:var(--color-brand-50)] px-2.5 py-1 text-xs font-semibold text-[color:var(--color-brand-700)]">#{tag}</span>
              ))}
            </div>
          )}

          {source && (
            <p className="text-xs text-[color:var(--color-ink-soft)]">
              {t.events.source}:{" "}
              <a href={source} target="_blank" rel="noopener noreferrer nofollow" className="underline">{hostOf(source)}</a>
            </p>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16 space-y-4">
          <h2 className="text-2xl font-extrabold tracking-tight">{t.events.related}</h2>
          <EventGrid events={related} />
        </section>
      )}
    </article>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-3 px-4 py-3">
      <dt className="text-xs font-bold uppercase tracking-wider text-[color:var(--color-ink-soft)]">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
