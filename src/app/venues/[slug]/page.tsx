import { notFound } from "next/navigation";
import { getVenueBySlug, listEvents, listPastVenueEvents } from "@/lib/queries";
import { decodeSlug, safeHttpUrl } from "@/lib/url";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { t } from "@/lib/i18n";
import EventGrid from "@/components/EventGrid";
import JsonLd from "@/components/JsonLd";
import type { Metadata } from "next";

export const revalidate = 1800;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await getVenueBySlug(decodeSlug((await params).slug));
  if (!v) return { title: t.notFound.title, robots: { index: false } };
  return pageMetadata({
    title: `${v.name}: upcoming events`,
    description: v.description ?? `What's on at ${v.name}${v.area ? `, ${v.area}` : ""}, Bangkok: upcoming events, tickets and dates.`,
    path: `/venues/${v.slug}`,
  });
}

export default async function VenuePage({ params }: Props) {
  const v = await getVenueBySlug(decodeSlug((await params).slug));
  if (!v) notFound();
  const [upcoming, past] = await Promise.all([listEvents({ venueId: v.id, limit: 100 }), listPastVenueEvents(v.id, 8)]);
  const site = safeHttpUrl(v.url);
  const maps =
    v.lat != null && v.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([v.name, v.address, "Bangkok"].filter(Boolean).join(", "))}`;
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Place",
          name: v.name,
          url: absoluteUrl(`/venues/${v.slug}`),
          address: { "@type": "PostalAddress", streetAddress: v.address ?? undefined, addressLocality: "Bangkok", addressCountry: "TH" },
          ...(v.lat != null && v.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: v.lat, longitude: v.lng } } : {}),
        }}
      />
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">📍 {v.name}</h1>
        <p className="mt-1 text-[color:var(--color-ink-soft)]">{[v.address, v.area, "Bangkok"].filter(Boolean).join(", ")}</p>
        {v.description && <p className="mt-3 max-w-2xl">{v.description}</p>}
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
          <a href={maps} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 hover:border-[color:var(--color-ink)]">{t.venue.map} ↗</a>
          {site && <a href={site} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 hover:border-[color:var(--color-ink)]">{t.venue.website} ↗</a>}
        </div>
      </header>
      <section className="space-y-4">
        <h2 className="text-2xl font-extrabold">{t.venue.upcoming}</h2>
        <EventGrid events={upcoming} />
      </section>
      {past.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-[color:var(--color-ink-soft)]">{t.venue.past}</h2>
          <EventGrid events={past} />
        </section>
      )}
    </div>
  );
}
