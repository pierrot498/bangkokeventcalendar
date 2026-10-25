import { bangkokDate, formatBangkok } from "./datetime";
import type { EventRow } from "./supabase/types";

type WhenInput = Pick<EventRow, "starts_at" | "ends_at" | "all_day">;

// "Sat 1 Nov · 19:00", "Sat 1 Nov" (all day), "1 – 3 Nov" (multi-day).
export function formatWhen(e: WhenInput, opts: { long?: boolean } = {}): string {
  const dayFmt: Intl.DateTimeFormatOptions = opts.long
    ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
    : { weekday: "short", day: "numeric", month: "short" };
  const startDay = bangkokDate(e.starts_at);
  const endDay = e.ends_at ? bangkokDate(e.ends_at) : startDay;
  const time = (iso: string) => formatBangkok(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (endDay > startDay) {
    const a = formatBangkok(e.starts_at, opts.long ? dayFmt : { day: "numeric", month: "short" });
    const b = formatBangkok(e.ends_at!, opts.long ? dayFmt : { day: "numeric", month: "short" });
    return `${a} – ${b}`;
  }
  const day = formatBangkok(e.starts_at, dayFmt);
  if (e.all_day) return day;
  const end = e.ends_at && Date.parse(e.ends_at) > Date.parse(e.starts_at) ? `–${time(e.ends_at)}` : "";
  return `${day} · ${time(e.starts_at)}${end}`;
}

export function dateBadge(iso: string): { mon: string; day: string } {
  return {
    mon: formatBangkok(iso, { month: "short" }).toUpperCase(),
    day: formatBangkok(iso, { day: "numeric" }),
  };
}

export function locationLine(e: Pick<EventRow, "venue_name" | "area">): string {
  return [e.venue_name, e.area].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ");
}
