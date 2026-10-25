// Minimal RFC 5545 VEVENT parser: line unfolding, params, DATE / UTC /
// TZID / floating times (floating and TZID times are taken as Bangkok wall
// time unless the TZID is a fixed-offset zone we can resolve via Intl).
// Recurring events (RRULE) contribute their first occurrence only.
import type { RawEvent } from "../types";

type Prop = { name: string; params: Record<string, string>; value: string };

function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): Prop | null {
  const m = line.match(/^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/);
  if (!m) return null;
  const params: Record<string, string> = {};
  for (const p of m[2].split(";").filter(Boolean)) {
    const [k, ...v] = p.split("=");
    params[k.toUpperCase()] = v.join("=").replace(/^"|"$/g, "");
  }
  return { name: m[1].toUpperCase(), params, value: m[3] };
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

// Offset (ms) of `tz` at the given UTC instant, via Intl.
function tzOffsetMs(tz: string, utcMs: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(utcMs));
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
    return asUtc - utcMs;
  } catch {
    return null;
  }
}

// → ISO string (UTC) or "YYYY-MM-DD" for all-day values.
export function icsDate(p: Prop): { value: string; dateOnly: boolean } | null {
  const v = p.value.trim();
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m || p.params.VALUE === "DATE") {
    m = m ?? v.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return { value: `${m[1]}-${m[2]}-${m[3]}`, dateOnly: true };
  }
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  if (m[7]) return { value: new Date(wall).toISOString(), dateOnly: false };
  const tz = p.params.TZID || "Asia/Bangkok";
  const off = tzOffsetMs(tz, wall) ?? 7 * 3600_000;
  return { value: new Date(wall - off).toISOString(), dateOnly: false };
}

export function eventsFromIcs(text: string, feedUrl: string): RawEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) return [];
  const out: RawEvent[] = [];
  let cur: Prop[] | null = null;
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT/i.test(line)) cur = [];
    else if (/^END:VEVENT/i.test(line)) {
      if (cur) {
        const ev = toRaw(cur, feedUrl);
        if (ev) out.push(ev);
      }
      cur = null;
    } else if (cur) {
      const p = parseLine(line);
      if (p) cur.push(p);
    }
  }
  return out;
}

function toRaw(props: Prop[], feedUrl: string): RawEvent | null {
  const get = (n: string) => props.find((p) => p.name === n);
  const summary = get("SUMMARY");
  const dtstart = get("DTSTART");
  if (!summary || !dtstart) return null;
  const start = icsDate(dtstart);
  if (!start) return null;
  const dtend = get("DTEND");
  let end = dtend ? icsDate(dtend) : null;
  if (end && end.dateOnly) {
    // DTEND;VALUE=DATE is exclusive: step back one day.
    const d = new Date(`${end.value}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    end = { value: d.toISOString().slice(0, 10), dateOnly: true };
  }
  const status = get("STATUS")?.value.toUpperCase();
  const geo = get("GEO")?.value.split(/[;,]/).map(Number);
  const url = get("URL")?.value;
  const loc = get("LOCATION") ? unescape(get("LOCATION")!.value) : null;
  const uid = get("UID")?.value;
  return {
    external_id: uid ? `${uid}${get("RECURRENCE-ID") ? `@${get("RECURRENCE-ID")!.value}` : ""}` : null,
    title: unescape(summary.value),
    description: get("DESCRIPTION") ? unescape(get("DESCRIPTION")!.value) : null,
    start: start.value,
    end: end?.value ?? null,
    all_day: start.dateOnly,
    venue_name: loc ? loc.split(",")[0].trim() : null,
    address: loc,
    lat: geo && geo.length === 2 && Number.isFinite(geo[0]) ? geo[0] : null,
    lng: geo && geo.length === 2 && Number.isFinite(geo[1]) ? geo[1] : null,
    url: url ?? feedUrl,
    ticket_url: url ?? null,
    organizer: get("ORGANIZER")?.params.CN ?? null,
    cancelled: status === "CANCELLED",
    tags: get("CATEGORIES") ? unescape(get("CATEGORIES")!.value).split(",").map((s) => s.trim()) : [],
  };
}
