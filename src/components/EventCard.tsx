import Link from "next/link";
import type { EventRow } from "@/lib/supabase/types";
import { categoryName, eventVisual, gradientStyle } from "@/lib/categories";
import { dateBadge, formatWhen, locationLine } from "@/lib/event-format";
import { safeHttpUrl } from "@/lib/url";
import { t } from "@/lib/i18n";

// Instagram-style square card: image (or category gradient + emoji), date
// badge, then title / when / where below.
export default function EventCard({ event }: { event: EventRow }) {
  const visual = eventVisual(event.category_slug, event.subcategory_slug);
  const img = safeHttpUrl(event.image_url);
  const badge = dateBadge(event.starts_at);
  const label = categoryName(event.subcategory_slug ?? event.category_slug);
  return (
    <Link href={`/events/${event.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-2xl" style={img ? undefined : gradientStyle(visual)}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="grid h-full w-full place-items-center text-6xl sm:text-7xl drop-shadow-sm transition-transform duration-300 group-hover:scale-110" aria-hidden>
            {visual.emoji}
          </div>
        )}
        <div className="absolute left-2 top-2 rounded-xl bg-white/95 px-2 py-1 text-center leading-none shadow-sm">
          <div className="text-[9px] font-bold tracking-wider text-[color:var(--color-brand-600)]">{badge.mon}</div>
          <div className="text-lg font-extrabold">{badge.day}</div>
        </div>
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          {event.status === "cancelled" && <span className="pill bg-red-600 text-white">{t.events.cancelled}</span>}
          {event.is_free && <span className="pill bg-emerald-500 text-white">{t.events.free}</span>}
          {event.featured && <span className="pill bg-[color:var(--color-brand)] text-white">{t.events.featured}</span>}
        </div>
        <div className="absolute bottom-2 left-2">
          <span className="pill bg-black/55 text-white backdrop-blur-sm">
            {visual.emoji} {label}
          </span>
        </div>
      </div>
      <div className="mt-2 px-0.5">
        <h3 className="line-clamp-2 font-bold leading-snug group-hover:text-[color:var(--color-brand-600)]">{event.title}</h3>
        <p className="mt-0.5 text-xs text-[color:var(--color-ink-soft)]">{formatWhen(event)}</p>
        {locationLine(event) && <p className="line-clamp-1 text-xs text-[color:var(--color-ink-soft)]">{locationLine(event)}</p>}
        {event.price_text && !event.is_free && <p className="text-xs font-semibold">{event.price_text}</p>}
      </div>
    </Link>
  );
}
