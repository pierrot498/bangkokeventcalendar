// Step "indexnow": submit new / changed URLs to IndexNow (Bing, Yandex,
// Seznam, Naver, Yep). Ported from runclubbangkok scripts/indexnow.ts. The
// key is public by design: IndexNow verifies it by fetching
// <site>/<key>.txt, which lives in /public (the 32-hex-char file there).
import fs from "node:fs";
import path from "node:path";
import { emptyStats, type JobContext, type StepResult } from "../types";

function indexNowKey(): string | null {
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY;
  const dir = path.resolve(process.cwd(), "public");
  try {
    const f = fs.readdirSync(dir).find((n) => /^[0-9a-f]{32}\.txt$/.test(n));
    return f ? f.slice(0, -4) : null;
  } catch {
    return null;
  }
}

export async function runIndexNow(ctx: JobContext): Promise<StepResult> {
  const stats = emptyStats();
  let host: string;
  try {
    host = new URL(ctx.siteUrl).host;
  } catch {
    return { status: "skipped", stats, summary: "NEXT_PUBLIC_SITE_URL invalid" };
  }
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host)) return { status: "skipped", stats, summary: `local host ${host}` };
  const key = indexNowKey();
  if (!key) return { status: "skipped", stats, summary: "no IndexNow key file in public/" };
  if (ctx.changedSlugs.size === 0) return { status: "skipped", stats, summary: "no new or changed URLs" };
  const urls = [
    `${ctx.siteUrl}/`,
    `${ctx.siteUrl}/events`,
    `${ctx.siteUrl}/calendar`,
    ...[...ctx.changedSlugs].map((s) => `${ctx.siteUrl}/events/${encodeURIComponent(s)}`),
  ];
  stats.fetched = urls.length;
  if (ctx.dryRun) return { status: "skipped", stats, summary: `[dry-run] would submit ${urls.length} URLs` };
  for (let i = 0; i < urls.length; i += 10_000) {
    const batch = urls.slice(i, i + 10_000);
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `${ctx.siteUrl}/${key}.txt`, urlList: batch }),
    });
    if (res.status >= 400) throw new Error(`IndexNow → ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return { status: "ok", stats, summary: `submitted ${urls.length} URLs` };
}
