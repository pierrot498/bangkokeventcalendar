// CLI runner for the daily jobs (src/lib/jobs). Same pattern as
// runclubbangkok's scripts/run-job.ts; logs each step to bke_job_runs.
//
//   npm run jobs:daily                       fetch → dedupe → cleanup → revalidate → indexnow
//   npm run job -- --step=fetch,dedupe       a subset (also: --step fetch, or bare names)
//   npm run jobs:daily -- --dry-run          plan + print changes, write nothing
//   npm run job -- --list                    list steps
//
// Loads .env.local (already-set env vars win). Prints step names, run ids,
// stats and summaries only, never env values. Exit 1 if any step failed
// (later steps still run); exit 2 for usage errors or missing tables.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const envFile = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const TOTAL_KEYS = ["fetched", "inserted", "updated", "merged", "deleted", "skipped", "flagged"] as const;

function parseArgs(argv: string[]) {
  const steps: string[] = [];
  let daily = false;
  let dryRun = false;
  let list = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--daily") daily = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--list" || a === "-h" || a === "--help") list = true;
    else if (a.startsWith("--step=")) steps.push(...a.slice(7).split(","));
    else if (a === "--step" && argv[i + 1]) steps.push(...argv[++i].split(","));
    else if (!a.startsWith("--")) steps.push(...a.split(","));
    else {
      console.error(`unknown flag ${a} (try --list)`);
      process.exit(2);
    }
  }
  return { steps: steps.map((s) => s.trim()).filter(Boolean), daily, dryRun, list };
}

async function main() {
  const jobs = await import("../src/lib/jobs");
  const { STEPS, getStep } = jobs;
  const args = parseArgs(process.argv.slice(2));

  if (args.list || (!args.daily && args.steps.length === 0)) {
    console.log("steps:");
    for (const s of STEPS) console.log(`  ${s.name.padEnd(12)} ${s.label}`);
    console.log(`\ndaily: ${STEPS.map((s) => s.name).join(" → ")}`);
    console.log("flags: --daily  --step=<a,b>  --dry-run  --list");
    if (!args.list) process.exitCode = 2;
    return;
  }

  const unknown = args.steps.filter((n) => !getStep(n));
  if (unknown.length) {
    console.error(`unknown step(s): ${unknown.join(", ")} (try --list)`);
    process.exit(2);
  }
  // Canonical order, whatever order the flags came in.
  const selected = args.daily ? STEPS : STEPS.filter((s) => args.steps.includes(s.name));

  let tablesMissing = false;
  try {
    tablesMissing = !(await jobs.bkeTablesExist());
  } catch (e) {
    console.error(`cannot reach Supabase: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  if (tablesMissing) {
    if (!args.dryRun) {
      console.error(jobs.MIGRATION_HINT);
      process.exit(2);
    }
    console.log(`(dry run) ${jobs.MIGRATION_HINT}`);
    console.log("(dry run) continuing with read-only sources that exist (runclubbangkok run_events).");
  }

  const ctx: import("../src/lib/jobs").JobContext = {
    runId: randomUUID(),
    dryRun: args.dryRun,
    triggeredBy: process.env.JOB_TRIGGERED_BY ?? "cli",
    tablesMissing,
    siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
    changedSlugs: new Set(),
    log: (line) => console.log(line),
  };

  console.log(`run ${ctx.runId}${ctx.dryRun ? " [dry-run]" : ""}: ${selected.map((s) => s.name).join(" → ")}`);
  const totals: Record<string, number> = Object.fromEntries(TOTAL_KEYS.map((k) => [k, 0]));
  let failed = 0;

  for (const step of selected) {
    const t0 = Date.now();
    console.log(`\n▶ ${step.name}`);
    const rowId = await jobs.logStepStart(ctx, step.name);
    try {
      const res = await step.run(ctx);
      await jobs.logStepEnd(ctx, rowId, { status: res.status, stats: res.stats });
      for (const k of TOTAL_KEYS) totals[k] += Number(res.stats[k] ?? 0);
      const s = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`${res.status === "ok" ? "ok     " : "skipped"} ${step.name}  ${s}s  ${res.summary}`);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      await jobs.logStepEnd(ctx, rowId, { status: "failed", error: msg });
      const s = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`FAILED  ${step.name}  ${s}s  ${msg.slice(0, 300)}`);
    }
  }

  console.log(
    `\nsummary${ctx.dryRun ? " (dry-run, nothing written)" : ""}: ` +
      TOTAL_KEYS.map((k) => `${k}=${totals[k]}`).join("  ") +
      (failed ? `  FAILED_STEPS=${failed}` : ""),
  );
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
