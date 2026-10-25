// ICS (RFC 5545) + Google Calendar helpers, adapted from runclubbangkok's
// src/lib/calendar.ts. All-day events export as VALUE=DATE entries.

import { bangkokDate } from "./datetime";
import { SITE_URL } from "./site";
import { t } from "./i18n";

export type CalendarEventInput = {
  uid: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  updatedAt?: string | null;
  status?: string | null;
  categories?: string[];
};

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

function fmtUtc(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function fmtDate(day: string, plusDays = 0): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

type Range =
  | { allDay: true; start: string; end: string }
  | { allDay: false; start: Date; end: Date };

export function calendarRange(e: CalendarEventInput): Range {
  if (e.allDay) {
    const startDay = bangkokDate(e.startsAt);
    const endDay = e.endsAt && !Number.isNaN(Date.parse(e.endsAt)) ? bangkokDate(e.endsAt) : startDay;
    const lastDay = endDay > startDay ? endDay : startDay;
    return { allDay: true, start: fmtDate(startDay), end: fmtDate(lastDay, 1) };
  }
  const start = new Date(e.startsAt);
  const endMs = e.endsAt ? Date.parse(e.endsAt) : NaN;
  const end = !Number.isNaN(endMs) && endMs > start.getTime() ? new Date(endMs) : new Date(start.getTime() + DEFAULT_DURATION_MS);
  return { allDay: false, start, end };
}

export function googleCalendarUrl(e: CalendarEventInput): string {
  const r = calendarRange(e);
  const dates = r.allDay ? `${r.start}/${r.end}` : `${fmtUtc(r.start)}/${fmtUtc(r.end)}`;
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", e.title);
  u.searchParams.set("dates", dates);
  u.searchParams.set("ctz", "Asia/Bangkok");
  const details = [e.description, e.url].filter(Boolean).join("\n\n");
  if (details) u.searchParams.set("details", details.slice(0, 1500));
  if (e.location) u.searchParams.set("location", e.location);
  return u.toString();
}

function escapeIcs(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\r\n?|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\;");
}

// Fold lines at 75 octets (RFC 5545 §3.1), never splitting a UTF-8 sequence.
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curBytes + b > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function veventLines(e: CalendarEventInput, now: Date): string[] {
  const r = calendarRange(e);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${fmtUtc(now)}`,
    ...(e.updatedAt && !Number.isNaN(Date.parse(e.updatedAt)) ? [`LAST-MODIFIED:${fmtUtc(new Date(e.updatedAt))}`] : []),
    ...(r.allDay
      ? [`DTSTART;VALUE=DATE:${r.start}`, `DTEND;VALUE=DATE:${r.end}`]
      : [`DTSTART:${fmtUtc(r.start)}`, `DTEND:${fmtUtc(r.end)}`]),
    `SUMMARY:${escapeIcs(e.title)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${escapeIcs(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeIcs(e.location)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  if (e.categories?.length) lines.push(`CATEGORIES:${e.categories.map(escapeIcs).join(",")}`);
  if (e.status === "cancelled") lines.push("STATUS:CANCELLED");
  lines.push("END:VEVENT");
  return lines;
}

export function icsCalendar(events: CalendarEventInput[], opts: { name?: string } = {}): string {
  const now = new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//bangkokeventcalendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(opts.name ?? t.site.name)}`,
    "X-WR-TIMEZONE:Asia/Bangkok",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...events.flatMap((e) => veventLines(e, now)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function eventUid(slug: string): string {
  const host = SITE_URL.replace(/^https?:\/\//, "").replace(/[:/].*$/, "") || "bangkokeventcalendar";
  return `${slug}@${host}`;
}
