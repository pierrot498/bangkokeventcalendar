// Normalisation shared by every source: Bangkok time, Bangkok-only filter,
// category inference, text cleanup. Pure functions (no I/O).
import { normalizeCategory } from "../categories";
import { BKK_OFFSET_MS } from "../datetime";
import type { NormalizedEvent, RawEvent } from "./types";

const DAY = 24 * 60 * 60 * 1000;

// ---- text -------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function cleanText(input: unknown, { oneLine = false, max = 20_000 } = {}): string | null {
  if (typeof input !== "string") return null;
  let s = input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (m, e: string) => {
      if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith("#")) return String.fromCodePoint(Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\r\n?/g, "\n");
  s = oneLine ? s.replace(/\s+/g, " ") : s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  s = s.trim().slice(0, max);
  return s || null;
}

export function summaryFrom(description: string | null, max = 220): string | null {
  if (!description) return null;
  const one = description.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${cut.slice(0, at > 120 ? at : max).replace(/[,.;:\s]+$/, "")}…`;
}

export function httpUrl(input: unknown, base?: string): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const u = new URL(input.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// ---- time -------------------------------------------------------------------

// Parse a date/time string into an instant. Naive wall times (no offset /
// no Z) are Bangkok local; "YYYY-MM-DD" alone is an all-day Bangkok date.
export function parseWhen(input: string | null | undefined): { iso: string; dateOnly: boolean } | null {
  if (!input) return null;
  const s = input.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]) - BKK_OFFSET_MS;
    return { iso: new Date(t).toISOString(), dateOnly: true };
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (m) {
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) - BKK_OFFSET_MS;
    return { iso: new Date(t).toISOString(), dateOnly: false };
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return { iso: new Date(t).toISOString(), dateOnly: false };
}

// ---- Bangkok filter ---------------------------------------------------------

// Bangkok metro + immediate neighbours (Nonthaburi, Pathum Thani, Samut Prakan).
const BKK_BOX = { minLat: 13.4, maxLat: 14.3, minLng: 100.2, maxLng: 101.0 };

const NON_BANGKOK =
  /\b(chiang ?mai|chiang ?rai|phuket|pattaya|hua ?hin|krabi|koh ?samui|samui|ko ?pha ?ngan|koh ?phangan|ko ?tao|khon ?kaen|udon ?thani|korat|nakhon ratchasima|khao ?yai|kanchanaburi|ayutthaya|rayong|chon ?buri|chonburi|sriracha|si racha|cha[- ]?am|prachuap|surat ?thani|songkhla|hat ?yai|phitsanulok|lampang|pai|koh ?chang|ko ?lanta|koh ?lanta|phang ?nga|trat|chanthaburi|ratchaburi|nakhon ?pathom|singapore|kuala ?lumpur|malaysia|vietnam|ho chi minh|hanoi|cambodia|phnom penh|siem reap|laos|vientiane|myanmar|yangon|bali|indonesia|jakarta|manila|philippines|hong ?kong|taipei|tokyo|seoul|online only|virtual run)\b|เชียงใหม่|เชียงราย|ภูเก็ต|พัทยา|หัวหิน|กระบี่|เกาะสมุย|ขอนแก่น|อุดรธานี|โคราช|นครราชสีมา|เขาใหญ่|กาญจนบุรี|อยุธยา|ระยอง|ชลบุรี|สุราษฎร์|สงขลา|หาดใหญ่/i;

export function bangkokVerdict(raw: Pick<RawEvent, "lat" | "lng" | "venue_name" | "address" | "locality" | "online" | "title">): {
  keep: boolean;
  reason?: string;
} {
  if (raw.online) return { keep: false, reason: "online" };
  if (typeof raw.lat === "number" && typeof raw.lng === "number" && Number.isFinite(raw.lat) && Number.isFinite(raw.lng)) {
    const inBox =
      raw.lat >= BKK_BOX.minLat && raw.lat <= BKK_BOX.maxLat && raw.lng >= BKK_BOX.minLng && raw.lng <= BKK_BOX.maxLng;
    return inBox ? { keep: true } : { keep: false, reason: "coords outside Bangkok" };
  }
  const where = [raw.venue_name, raw.address, raw.locality].filter(Boolean).join(" ");
  if (/bangkok|กรุงเทพ|nonthaburi|นนทบุรี|samut prakan|สมุทรปราการ|pathum thani|ปทุมธานี/i.test(where)) return { keep: true };
  if (NON_BANGKOK.test(where) || NON_BANGKOK.test(raw.title ?? "")) return { keep: false, reason: "non-Bangkok location" };
  return { keep: true }; // unknown: keep (sources are Bangkok-focused)
}

// ---- areas ------------------------------------------------------------------

const AREAS: [RegExp, string][] = [
  [/thong ?lo|thonglor/i, "Thonglor"],
  [/ekkamai/i, "Ekkamai"],
  [/phrom ?phong|prompong/i, "Phrom Phong"],
  [/asok|asoke/i, "Asok"],
  [/nana\b/i, "Nana"],
  [/on ?nut/i, "On Nut"],
  [/sukhumvit/i, "Sukhumvit"],
  [/silom/i, "Silom"],
  [/sathorn|sathon/i, "Sathorn"],
  [/bang ?rak/i, "Bang Rak"],
  [/charoen ?krung|riverside|icon ?siam/i, "Riverside"],
  [/yaowarat|chinatown/i, "Chinatown"],
  [/khao ?san|banglamphu|rattanakosin|old town|sanam luang/i, "Old Town"],
  [/siam|pathum ?wan|ratchaprasong|chit ?lom|chidlom|ploen ?chit|ploenchit/i, "Siam"],
  [/lumphini|lumpini/i, "Lumpini"],
  [/benjakitti|queen sirikit|qsncc|khlong ?toei/i, "Khlong Toei"],
  [/ari\b|phaya ?thai|saphan ?khwai/i, "Ari"],
  [/chatuchak|mo ?chit|lat ?phrao|ladprao/i, "Chatuchak"],
  [/ratchada|huai ?khwang|rama ?9|rama ix/i, "Ratchada"],
  [/bang ?na|bitec|mega ?bangna/i, "Bang Na"],
  [/thonburi|klong ?san|khlong ?san/i, "Thonburi"],
  [/nonthaburi|impact|muang ?thong/i, "Nonthaburi"],
  [/samut ?prakan/i, "Samut Prakan"],
  [/pathum ?thani|rangsit|thammasat/i, "Pathum Thani"],
  [/hua ?mak|huamark|ramkhamhaeng|bang ?kapi/i, "Bang Kapi"],
];

export function inferArea(...texts: (string | null | undefined)[]): string | null {
  const s = texts.filter(Boolean).join(" ");
  for (const [re, name] of AREAS) if (re.test(s)) return name;
  return null;
}

// ---- categories -------------------------------------------------------------

const SPORT_RULES: [RegExp, string][] = [
  [/\bhyrox\b|crossfit|functional fitness|fitness (race|challenge|competition)|bootcamp/i, "hyrox"],
  [/triathlon|duathlon|aquathlon|ironman|\b70\.3\b/i, "triathlon"],
  [/marathon|\b(5|10|21|42)\s?k\b|fun ?run|trail run|run club|\brun\b|running|วิ่ง/i, "running"],
  [/padel/i, "padel"],
  [/pickleball/i, "pickleball"],
  [/cycling|cyclist|\bbike\b|gran ?fondo|criterium|\bride\b|ปั่น/i, "cycling"],
  [/muay ?thai|มวย|boxing|fight night|rajadamnern|lumpinee stadium|one championship|\bmma\b|kickboxing/i, "muay-thai"],
  [/football|futsal|thai league|soccer|ฟุตบอล/i, "football"],
  [/\byoga\b|โยคะ/i, "yoga"],
  [/\bgolf\b|กอล์ฟ/i, "golf"],
  [/\btennis\b|เทนนิส/i, "tennis"],
  [/basketball|บาสเกตบอล/i, "basketball"],
  [/\bswim|open water|ว่ายน้ำ/i, "swimming"],
  [/climbing|bouldering/i, "climbing"],
];

const TOP_RULES: [RegExp, string][] = [
  [/festival|songkran|loy ?krathong|countdown|new year'?s? eve|\bfest\b|เทศกาล/i, "festivals"],
  [/concert|live music|\bgig\b|orchestra|symphony|philharmonic|\bjazz\b|world tour|\bband\b|คอนเสิร์ต/i, "concerts"],
  [/\bdj\b|club night|\brave\b|techno|house music|afterparty|\bparty\b|nightclub/i, "nightlife"],
  [/night market|flea market|\bmarket\b|bazaar|craft fair|pop-?up|ตลาด/i, "markets"],
  [/\bfood\b|dinner|brunch|\bwine\b|\bbeer\b|cocktail|tasting|\bchef\b|whisk(e)?y|coffee|omakase|buffet/i, "food-drink"],
  [/exhibition|gallery|\bart\b|museum|theatre|theater|musical|\bfilm\b|screening|cinema|comedy|stand-?up|ballet|opera|\bdance\b|นิทรรศการ/i, "art-culture"],
  [/\bkids?\b|family|children|toddler/i, "family"],
  [/conference|summit|meetup|startup|networking|webinar|\btech\b|\bexpo\b|forum|hackathon|\bai\b|blockchain|crypto/i, "business-tech"],
  [/wellness|meditation|sound ?bath|breathwork|retreat|mindful|healing|reiki/i, "wellness"],
];

export function inferCategory(
  text: string,
  sourceCategory: string | null | undefined,
  hint?: { category?: string | null; subcategory?: string | null },
): { category_slug: string; subcategory_slug: string | null } {
  // An explicit hint (AI extraction / seed-like data) wins when valid.
  if (hint?.category) {
    const n = normalizeCategory(hint.category, hint.subcategory);
    if (n.category_slug !== "other") return n;
  }
  for (const [re, sub] of SPORT_RULES) if (re.test(text)) return { category_slug: "sports", subcategory_slug: sub };
  if (sourceCategory) {
    const n = normalizeCategory(sourceCategory, null);
    if (n.category_slug !== "other") return n;
  }
  for (const [re, cat] of TOP_RULES) if (re.test(text)) return { category_slug: cat, subcategory_slug: null };
  return { category_slug: "other", subcategory_slug: null };
}

// ---- raw → normalized ---------------------------------------------------------

export type NormalizeResult = { ok: true; event: NormalizedEvent } | { ok: false; reason: string };

export function normalizeRaw(
  raw: RawEvent,
  opts: { source: string; sourceId: string | null; sourceCategory: string | null; fallbackId: string; now?: Date },
): NormalizeResult {
  const now = (opts.now ?? new Date()).getTime();
  const title = cleanText(raw.title, { oneLine: true, max: 200 });
  if (!title) return { ok: false, reason: "no title" };
  const start = parseWhen(raw.start);
  if (!start) return { ok: false, reason: "no/invalid start" };
  const end = parseWhen(raw.end ?? null);
  const allDay = raw.all_day ?? start.dateOnly;
  let endsAt: string | null = end?.iso ?? null;
  if (end && end.dateOnly && allDay) {
    // Date-only end is inclusive: end of that Bangkok day.
    endsAt = new Date(Date.parse(end.iso) + DAY - 1000).toISOString();
  }
  if (endsAt && Date.parse(endsAt) < Date.parse(start.iso)) endsAt = null;
  const effectiveEnd = endsAt ? Date.parse(endsAt) : Date.parse(start.iso) + DAY;
  if (effectiveEnd < now) return { ok: false, reason: "past" };
  if (Date.parse(start.iso) > now + 548 * DAY) return { ok: false, reason: "too far ahead" };

  const verdict = bangkokVerdict(raw);
  if (!verdict.keep) return { ok: false, reason: verdict.reason ?? "not Bangkok" };

  const description = cleanText(raw.description);
  const summary = cleanText(raw.summary, { oneLine: true, max: 300 }) ?? summaryFrom(description);
  const venue = cleanText(raw.venue_name, { oneLine: true, max: 200 });
  const address = cleanText(raw.address, { oneLine: true, max: 300 });
  const text = [title, summary, (raw.tags ?? []).join(" ")].join(" ");
  const cat = inferCategory(text, opts.sourceCategory, { category: raw.category, subcategory: raw.subcategory });
  const priceText = cleanText(raw.price_text, { oneLine: true, max: 120 });
  const isFree = raw.is_free ?? (priceText ? /^free\b|ฟรี/i.test(priceText) : false);

  return {
    ok: true,
    event: {
      source: opts.source,
      external_id: (raw.external_id ?? "").toString().trim() || opts.fallbackId,
      source_id: opts.sourceId,
      title,
      summary,
      description,
      category_slug: cat.category_slug,
      subcategory_slug: cat.subcategory_slug,
      tags: Array.from(new Set((raw.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 12),
      starts_at: start.iso,
      ends_at: endsAt,
      all_day: allDay,
      venue_name: venue,
      area: cleanText(raw.area, { oneLine: true, max: 80 }) ?? inferArea(venue, address, raw.locality),
      address,
      lat: typeof raw.lat === "number" && Number.isFinite(raw.lat) ? raw.lat : null,
      lng: typeof raw.lng === "number" && Number.isFinite(raw.lng) ? raw.lng : null,
      price_text: priceText ?? (isFree ? "Free" : null),
      is_free: isFree,
      ticket_url: httpUrl(raw.ticket_url) ?? null,
      source_url: httpUrl(raw.url) ?? null,
      image_url: httpUrl(raw.image_url) ?? null,
      organizer: cleanText(raw.organizer, { oneLine: true, max: 200 }),
      cancelled: !!raw.cancelled,
    },
  };
}

// Stable short hash for fallback external ids (FNV-1a, hex).
export function hashId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
