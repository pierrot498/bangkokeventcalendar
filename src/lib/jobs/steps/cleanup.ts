// Step "cleanup":
//  - past events (ends_at, or starts_at + 1 day, before now) are only
//    counted: listings already query upcoming rows, so they drop out on
//    their own and keep their URLs;
//  - drafts untouched for 90 days are hard-deleted (unless another row
//    points at them through duplicate_of);
//  - fetched rows (source not seed/manual) still upcoming but not seen in
//    any source for 14 days get needs_review = true (never deleted).
import { dbError, jobsDb, selectAll } from "../db";
import { emptyStats, type JobContext, type StepResult } from "../types";

const DAY = 24 * 3600_000;

export async function runCleanup(ctx: JobContext): Promise<StepResult> {
  const stats = emptyStats();
  if (ctx.tablesMissing) return { status: "skipped", stats, summary: "bke_events missing" };
  const sb = jobsDb();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const pastA = await sb.from("bke_events").select("id", { count: "exact", head: true }).lt("ends_at", nowIso);
  const pastB = await sb
    .from("bke_events")
    .select("id", { count: "exact", head: true })
    .is("ends_at", null)
    .lt("starts_at", new Date(now - DAY).toISOString());
  if (pastA.error) throw dbError(pastA.error, "count past");
  if (pastB.error) throw dbError(pastB.error, "count past");
  stats.past = (pastA.count ?? 0) + (pastB.count ?? 0);

  // Old drafts.
  const drafts = await selectAll<{ id: string; slug: string }>(
    (f, t) =>
      sb.from("bke_events").select("id, slug").eq("status", "draft").lt("updated_at", new Date(now - 90 * DAY).toISOString()).range(f, t),
    "old drafts",
  );
  const referenced = new Set(
    (
      await selectAll<{ duplicate_of: string }>(
        (f, t) => sb.from("bke_events").select("duplicate_of").not("duplicate_of", "is", null).range(f, t),
        "duplicate_of refs",
      )
    ).map((r) => r.duplicate_of),
  );
  const toDelete = drafts.filter((d) => !referenced.has(d.id));
  stats.deleted = toDelete.length;
  if (toDelete.length) ctx.log(`  - delete ${toDelete.length} stale drafts: ${toDelete.slice(0, 5).map((d) => d.slug).join(", ")}${toDelete.length > 5 ? " …" : ""}`);
  if (!ctx.dryRun) {
    for (let i = 0; i < toDelete.length; i += 100) {
      const { error } = await sb.from("bke_events").delete().in("id", toDelete.slice(i, i + 100).map((d) => d.id));
      if (error) throw dbError(error, "delete drafts");
    }
  }

  // Not seen for 14 days.
  const stale = await selectAll<{ id: string; slug: string }>(
    (f, t) =>
      sb
        .from("bke_events")
        .select("id, slug")
        .eq("status", "published")
        .eq("needs_review", false)
        .not("source", "in", "(seed,manual)")
        .lt("last_seen_at", new Date(now - 14 * DAY).toISOString())
        .gte("starts_at", nowIso)
        .range(f, t),
    "stale rows",
  );
  stats.flagged = stale.length;
  if (stale.length) ctx.log(`  ! needs review (not seen 14d): ${stale.slice(0, 5).map((s) => s.slug).join(", ")}${stale.length > 5 ? " …" : ""}`);
  if (!ctx.dryRun) {
    for (let i = 0; i < stale.length; i += 100) {
      const { error } = await sb.from("bke_events").update({ needs_review: true }).in("id", stale.slice(i, i + 100).map((s) => s.id));
      if (error) throw dbError(error, "flag stale");
    }
  }

  return {
    status: "ok",
    stats,
    summary: `${stats.past} past (hidden from listings), ${ctx.dryRun ? "would delete" : "deleted"} ${stats.deleted} old drafts, flagged ${stats.flagged} for review`,
  };
}
