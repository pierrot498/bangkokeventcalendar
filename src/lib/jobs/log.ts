// bke_job_runs logging: one row per step, grouped by run_id (the
// runclubbangkok run_agent_logs / run_sync_steps pattern, flattened).
// Dry runs and runs against a database without the tables log nothing.
import { jobsDb } from "./db";
import type { JobContext, StepResult } from "./types";

export async function logStepStart(ctx: JobContext, job: string): Promise<string | null> {
  if (ctx.dryRun || ctx.tablesMissing) return null;
  const { data, error } = await jobsDb()
    .from("bke_job_runs")
    .insert({ run_id: ctx.runId, job, status: "running", triggered_by: ctx.triggeredBy, dry_run: false })
    .select("id")
    .single();
  if (error) {
    ctx.log(`  (warn) could not write bke_job_runs: ${error.message}`);
    return null;
  }
  return data.id as string;
}

export async function logStepEnd(
  ctx: JobContext,
  rowId: string | null,
  result: { status: StepResult["status"] | "failed"; stats?: unknown; error?: string },
): Promise<void> {
  if (!rowId) return;
  const { error } = await jobsDb()
    .from("bke_job_runs")
    .update({
      status: result.status,
      finished_at: new Date().toISOString(),
      stats: result.stats ?? {},
      error: result.error?.slice(0, 4000) ?? null,
    })
    .eq("id", rowId);
  if (error) ctx.log(`  (warn) could not update bke_job_runs: ${error.message}`);
}
