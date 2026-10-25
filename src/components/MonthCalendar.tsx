import Link from "next/link";
import type { EventRow } from "@/lib/supabase/types";
import { bangkokDate, bangkokMonthEnd, bangkokMonthStart, bangkokParts, formatBangkok } from "@/lib/datetime";
import { eventVisual } from "@/lib/categories";
import { t } from "@/lib/i18n";

// Monthly grid (copied from runclubbangkok's events calendar, extended so
// multi-day events appear on every day they span).
export function monthPath(year: number, month0: number): string {
  const d = new Date(Date.UTC(year, month0, 1));
  return `/calendar/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function MonthCalendar({ year, month0, events }: { year: number; month0: number; events: EventRow[] }) {
  const monthStart = bangkokMonthStart(year, month0);
  const monthEnd = bangkokMonthEnd(year, month0);
  const daysInMonth = bangkokParts(monthEnd).day;
  const prefix = `${year}-${String(month0 + 1).padStart(2, "0")}-`;

  const byDay = new Map<number, EventRow[]>();
  for (const e of events) {
    const first = bangkokDate(e.starts_at);
    const last = e.ends_at && bangkokDate(e.ends_at) > first ? bangkokDate(e.ends_at) : first;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${prefix}${String(d).padStart(2, "0")}`;
      if (key >= first && key <= last) (byDay.get(d) ?? byDay.set(d, []).get(d))!.push(e);
    }
  }

  const firstWeekday = (bangkokParts(monthStart).weekday + 6) % 7; // Mon=0
  const cells: ({ day: number; events: EventRow[] } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, events: byDay.get(d) ?? [] });
  while (cells.length % 7) cells.push(null);

  const today = bangkokDate(new Date());
  const label = formatBangkok(monthStart, { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={monthPath(year, month0 - 1)} className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm font-semibold hover:border-[color:var(--color-ink)]">← {t.calendar.prev}</Link>
        <h2 className="text-xl font-extrabold">{label}</h2>
        <Link href={monthPath(year, month0 + 1)} className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm font-semibold hover:border-[color:var(--color-ink)]">{t.calendar.next} →</Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--color-ink-soft)] sm:text-xs">
        {t.calendar.weekdays.map((d) => (
          <div key={d} className="px-1 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="min-h-20 sm:min-h-28" />;
          const isToday = `${prefix}${String(cell.day).padStart(2, "0")}` === today;
          return (
            <div key={i} className={`flex min-h-20 flex-col gap-1 overflow-hidden rounded-lg border bg-white p-1 sm:min-h-28 sm:p-1.5 ${isToday ? "border-[color:var(--color-brand)] ring-1 ring-[color:var(--color-brand)]" : "border-[color:var(--color-line)]"}`}>
              <div className={`text-[11px] font-bold ${isToday ? "text-[color:var(--color-brand-600)]" : "text-[color:var(--color-ink-soft)]"}`}>{cell.day}</div>
              {cell.events.slice(0, 3).map((e) => (
                <Link key={e.id} href={`/events/${e.slug}`} title={e.title} className="line-clamp-2 rounded bg-[color:var(--color-brand-50)] px-1 py-0.5 text-[10px] leading-snug text-[color:var(--color-ink)] hover:bg-[color:var(--color-brand-100)] sm:text-[11px]">
                  <span aria-hidden>{eventVisual(e.category_slug, e.subcategory_slug).emoji}</span> {e.title}
                </Link>
              ))}
              {cell.events.length > 3 && <span className="text-[10px] text-[color:var(--color-ink-soft)]">{t.calendar.more(cell.events.length - 3)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
