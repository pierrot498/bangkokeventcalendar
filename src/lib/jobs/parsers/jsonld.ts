// schema.org Event extraction from HTML (JSON-LD), plus discovery of event
// detail links on listing pages (Eventpop, Ticketmelon, RA, Meetup, …).
import * as cheerio from "cheerio";
import type { RawEvent } from "../types";
import { httpUrl } from "../normalize";

type Node = Record<string, unknown>;

const EVENT_TYPE = /(^|:)(Event|[A-Za-z]+Event|Festival|EventSeries|CourseInstance)$/;

function types(n: Node): string[] {
  const t = n["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return str(v[0]);
  if (v && typeof v === "object") {
    const o = v as Node;
    return str(o.name ?? o.url ?? o["@value"] ?? o.text);
  }
  return null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

// Walk @graph / arrays / ItemList / nested "subEvent" to collect Event nodes.
function collect(node: unknown, out: Node[], depth = 0): void {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) {
    for (const n of node) collect(n, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const n = node as Node;
  if (types(n).some((t) => EVENT_TYPE.test(t))) out.push(n);
  if (n["@graph"]) collect(n["@graph"], out, depth + 1);
  if (n.itemListElement) {
    const items = Array.isArray(n.itemListElement) ? n.itemListElement : [n.itemListElement];
    for (const it of items) {
      if (it && typeof it === "object" && (it as Node).item) collect((it as Node).item, out, depth + 1);
      else collect(it, out, depth + 1);
    }
  }
  if (n.subEvent) collect(n.subEvent, out, depth + 1);
  if (n.mainEntity) collect(n.mainEntity, out, depth + 1);
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text.trim().replace(/^<!--|-->$/g, "").replace(/[\u0000-\u001f]+/g, " ");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function location(n: Node): Pick<RawEvent, "venue_name" | "address" | "locality" | "lat" | "lng" | "online"> {
  const locs = Array.isArray(n.location) ? n.location : [n.location];
  const mode = str(n.eventAttendanceMode) ?? "";
  let online = /OnlineEventAttendanceMode/.test(mode);
  for (const l of locs) {
    if (!l) continue;
    if (typeof l === "string") return { venue_name: l, online: false };
    const loc = l as Node;
    if (types(loc).includes("VirtualLocation")) {
      online = online || !/Mixed/.test(mode);
      continue;
    }
    const addr = loc.address;
    let address: string | null = null;
    let locality: string | null = null;
    if (typeof addr === "string") address = addr;
    else if (addr && typeof addr === "object") {
      const a = addr as Node;
      locality = [str(a.addressLocality), str(a.addressRegion)].filter(Boolean).join(", ") || null;
      address =
        [str(a.streetAddress), str(a.addressLocality), str(a.addressRegion), str(a.postalCode)]
          .filter(Boolean)
          .join(", ") || null;
    }
    const geo = (loc.geo ?? {}) as Node;
    return {
      venue_name: str(loc.name),
      address,
      locality,
      lat: num(geo.latitude),
      lng: num(geo.longitude),
      online: false,
    };
  }
  return { online };
}

function offers(n: Node): Pick<RawEvent, "price_text" | "is_free" | "ticket_url"> {
  const list = (Array.isArray(n.offers) ? n.offers : n.offers ? [n.offers] : []) as Node[];
  const prices: number[] = [];
  let currency = "THB";
  let url: string | null = null;
  for (const o of list) {
    if (!o || typeof o !== "object") continue;
    const candidates = [o.price, o.lowPrice, o.highPrice];
    for (const c of candidates) {
      const p = num(c);
      if (p !== null) prices.push(p);
    }
    currency = str(o.priceCurrency) ?? currency;
    url = url ?? str(o.url);
  }
  const isFree = n.isAccessibleForFree === true || (prices.length > 0 && Math.max(...prices) === 0);
  let priceText: string | null = null;
  if (isFree) priceText = "Free";
  else if (prices.length) {
    const min = Math.min(...prices.filter((p) => p > 0));
    const max = Math.max(...prices);
    const fmt = (p: number) => (currency === "THB" ? `฿${p.toLocaleString("en-US")}` : `${p.toLocaleString("en-US")} ${currency}`);
    priceText = Number.isFinite(min) && min !== max ? `${fmt(min)}–${fmt(max)}` : fmt(max);
  }
  return { price_text: priceText, is_free: isFree, ticket_url: url };
}

export function eventsFromJsonLd(html: string, pageUrl: string): RawEvent[] {
  const $ = cheerio.load(html);
  const nodes: Node[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const parsed = parseJsonLoose($(el).text());
    if (parsed) collect(parsed, nodes);
  });
  const out: RawEvent[] = [];
  for (const n of nodes) {
    const title = str(n.name);
    const start = str(n.startDate);
    if (!title || !start) continue;
    const url = httpUrl(str(n.url), pageUrl) ?? pageUrl;
    const image = Array.isArray(n.image) ? n.image[0] : n.image;
    const organizer = Array.isArray(n.organizer) ? n.organizer[0] : n.organizer;
    const status = str(n.eventStatus) ?? "";
    const off = offers(n);
    out.push({
      external_id: str(n["@id"]) ?? (url !== pageUrl ? url : null),
      title,
      description: str(n.description),
      start,
      end: str(n.endDate),
      ...location(n),
      ...off,
      ticket_url: httpUrl(off.ticket_url, pageUrl) ?? url,
      url,
      image_url: httpUrl(str(image), pageUrl),
      organizer: str(organizer),
      cancelled: /EventCancelled/.test(status),
      tags: typeof n.keywords === "string" ? n.keywords.split(/,\s*/).slice(0, 8) : [],
    });
  }
  return out;
}

// Event detail links on known listing sites, plus a same-host generic rule.
const DETAIL_PATTERNS: RegExp[] = [
  /^https?:\/\/(www\.)?eventpop\.me\/e\/[^/?#]+/i,
  /^https?:\/\/(www\.)?ticketmelon\.com\/[^/?#]+\/[^/?#]+\/?$/i,
  /^https?:\/\/(www\.)?ra\.co\/events\/\d+/i,
  /^https?:\/\/(www\.)?residentadvisor\.net\/events\/\d+/i,
  /^https?:\/\/(www\.)?meetup\.com\/[^/?#]+\/events\/\d+/i,
  /^https?:\/\/(www\.)?playtomic\.io\/(tournaments?|lessons|events)\/[^?#]+/i,
  /^https?:\/\/(www\.)?eventbrite\.[a-z.]+\/e\/[^/?#]+/i,
  /^https?:\/\/(www\.)?allevents\.in\/bangkok\/[^/?#]+\/\d+/i,
  /^https?:\/\/(www\.)?thaiticketmajor\.com\/(concert|performance|sport|exhibition)\/[^?#]+\.html/i,
];
const GENERIC_DETAIL = /\/(e|event|events|tournaments?|concerts?|shows?|activities|whats-on)\/[^/?#]{3,}/i;
const NOT_DETAIL = /\/(events|calendar|whats-on)\/?(page\/\d+)?\/?$|\/(category|tag|search|login|signup)\//i;

export function detailLinks(html: string, pageUrl: string, cap = 15): string[] {
  const $ = cheerio.load(html);
  const host = new URL(pageUrl).host;
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = httpUrl($(el).attr("href"), pageUrl);
    if (!href) return;
    const u = new URL(href);
    u.hash = "";
    // Known ticketing/listing sites: drop tracking query strings so the URL
    // (used as external id) is stable between runs.
    if (DETAIL_PATTERNS.some((re) => re.test(u.toString()))) u.search = "";
    const clean = u.toString();
    if (clean === pageUrl || seen.has(clean)) return;
    const known = DETAIL_PATTERNS.some((re) => re.test(clean));
    const generic = u.host === host && GENERIC_DETAIL.test(u.pathname) && !NOT_DETAIL.test(u.pathname);
    if (known || generic) seen.add(clean);
  });
  return [...seen].slice(0, cap);
}

// Visible text of a page for AI extraction (scripts/styles/nav removed).
export function pageText(html: string, max = 60_000): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, header, iframe").remove();
  const title = $("title").first().text().trim();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return `${title}\n\n${text}`.slice(0, max);
}

export function ogImage(html: string): string | null {
  const $ = cheerio.load(html);
  return $('meta[property="og:image"]').attr("content") ?? null;
}
