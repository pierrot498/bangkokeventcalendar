// Daily job registry (order = run order for --daily).
import { runCleanup } from "./steps/cleanup";
import { runDedupe } from "./steps/dedupe";
import { runFetch } from "./steps/fetch";
import { runIndexNow } from "./steps/indexnow";
import { runRevalidate } from "./steps/revalidate";
import type { Step } from "./types";

export const STEPS: Step[] = [
  { name: "fetch", label: "Pull events from bke_sources + runclubbangkok run_events", run: runFetch },
  { name: "dedupe", label: "Link duplicates (dedupe_key + fuzzy), merge into richest row", run: runDedupe },
  { name: "cleanup", label: "Count past, delete 90-day drafts, flag rows unseen for 14 days", run: runCleanup },
  { name: "revalidate", label: "POST /api/revalidate on the site", run: runRevalidate },
  { name: "indexnow", label: "Submit new/changed URLs to IndexNow", run: runIndexNow },
];

export function getStep(name: string): Step | undefined {
  return STEPS.find((s) => s.name === name);
}

export * from "./types";
export { bkeTablesExist, MIGRATION_HINT } from "./db";
export { logStepStart, logStepEnd } from "./log";
