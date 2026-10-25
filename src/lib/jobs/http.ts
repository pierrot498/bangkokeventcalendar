// Polite fetch for scraping: identifiable UA, timeout, size cap.
export const USER_AGENT =
  "BangkokEventCalendarBot/0.1 (+https://github.com/pierrot498/bangkokeventcalendar; event aggregator)";

const MAX_BYTES = 5_000_000;

export async function fetchText(
  url: string,
  { timeoutMs = 20_000, accept = "text/html,application/xhtml+xml,text/calendar,*/*;q=0.8" } = {},
): Promise<{ status: number; text: string; contentType: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "en,th;q=0.8" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const buf = await res.arrayBuffer();
    const text = new TextDecoder("utf-8").decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf);
    return { status: res.status, text, contentType: res.headers.get("content-type") ?? "", finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
