// Date helpers anchored to Asia/Bangkok (copied from runclubbangkok).
// Bangkok has no DST and a fixed UTC offset of +07:00.

import { INTL_LOCALE } from "./i18n";

export const BANGKOK_TZ = "Asia/Bangkok";
export const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatBangkok(
  input: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(INTL_LOCALE, { ...options, timeZone: BANGKOK_TZ }).format(d);
}

export function bangkokParts(input: string | Date): {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: number; // 0=Sun..6=Sat
  hour: number;
  minute: number;
} {
  const d = typeof input === "string" ? new Date(input) : input;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BANGKOK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (k: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === k)?.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const rawHour = Number(get("hour") ?? 0);
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[get("weekday") ?? "Mon"] ?? 1,
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number(get("minute") ?? 0),
  };
}

// "YYYY-MM-DD" of an instant in Bangkok.
export function bangkokDate(input: string | Date): string {
  const p = bangkokParts(input);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// First instant (UTC) of a Bangkok-local calendar month. `month` is 0-indexed.
export function bangkokMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1) - BKK_OFFSET_MS);
}

export function bangkokMonthEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 1) - BKK_OFFSET_MS - 1);
}

// Bangkok midnight (as a UTC instant) of the day containing `now`.
export function bangkokDayStart(now = new Date()): Date {
  const p = bangkokParts(now);
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - BKK_OFFSET_MS);
}

// "2026-05-15T08:00" (datetime-local input) as Bangkok wall time → ISO.
export function bangkokLocalInputToIso(value: string): string {
  return new Date(`${value}:00+07:00`).toISOString();
}

// The current or next weekend in Bangkok: Saturday 00:00 → Sunday 23:59:59.
// During the weekend it starts from `now`.
export function bangkokWeekend(now = new Date()): { start: Date; end: Date } {
  const p = bangkokParts(now);
  const midnight = Date.UTC(p.year, p.month - 1, p.day) - BKK_OFFSET_MS;
  const toSat = p.weekday === 0 ? -1 : 6 - p.weekday;
  const satMidnight = midnight + toSat * DAY_MS;
  return {
    start: new Date(Math.max(now.getTime(), satMidnight)),
    end: new Date(satMidnight + 2 * DAY_MS - 1),
  };
}

export type DateRangeKey = "today" | "weekend" | "week" | "month";

// Named ranges for the /events filter, all in Bangkok time.
export function bangkokRange(key: DateRangeKey, now = new Date()): { start: Date; end: Date } {
  const dayStart = bangkokDayStart(now).getTime();
  switch (key) {
    case "today":
      return { start: now, end: new Date(dayStart + DAY_MS - 1) };
    case "weekend":
      return bangkokWeekend(now);
    case "week": {
      // Rolling: now → end of the 7th Bangkok day (today + 6). A calendar
      // Mon–Sun week would shrink to "today only" on Sundays.
      return { start: now, end: new Date(dayStart + 7 * DAY_MS - 1) };
    }
    case "month": {
      const p = bangkokParts(now);
      return { start: now, end: bangkokMonthEnd(p.year, p.month - 1) };
    }
  }
}
