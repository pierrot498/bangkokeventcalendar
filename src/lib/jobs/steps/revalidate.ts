// Step "revalidate": ask the running site to drop its ISR cache
// (/api/revalidate). An unreachable site is "skipped", not a failure.
import { emptyStats, type JobContext, type StepResult } from "../types";

export async function runRevalidate(ctx: JobContext): Promise<StepResult> {
  const stats = emptyStats();
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return { status: "skipped", stats, summary: "REVALIDATE_SECRET unset" };
  const url = `${ctx.siteUrl}/api/revalidate`;
  if (ctx.dryRun) return { status: "skipped", stats, summary: `[dry-run] would POST ${url}` };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: ctrl.signal,
    });
  } catch (e) {
    return { status: "skipped", stats, summary: `site unreachable at ${ctx.siteUrl} (${e instanceof Error ? e.message : e})` };
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`revalidate → HTTP ${res.status}`);
  return { status: "ok", stats, summary: `revalidated ${ctx.siteUrl}` };
}
