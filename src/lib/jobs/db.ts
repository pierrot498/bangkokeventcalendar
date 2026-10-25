// Service-role Supabase client for the daily jobs (CLI only; never imported
// by pages). Kept separate from src/lib/supabase/server.ts, which is
// "server-only" and tuned for page rendering.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function jobsDb(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (set them in .env.local)");
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

type PgErr = { code?: string; message?: string } | null | undefined;

export function isMissingTable(err: PgErr): boolean {
  if (!err) return false;
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    /does not exist|Could not find the table|schema cache/i.test(err.message ?? "")
  );
}

export function dbError(err: PgErr, where: string): Error {
  return new Error(`${where}: ${err?.message ?? "unknown error"}${err?.code ? ` (${err.code})` : ""}`);
}

// Read every row of a query in pages of 1000 (PostgREST caps responses).
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: PgErr }>,
  where: string,
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw Object.assign(dbError(error, where), { pg: error });
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// True when the bke_ tables exist (probe the events table).
export async function bkeTablesExist(): Promise<boolean> {
  const { error } = await jobsDb().from("bke_events").select("id").limit(1);
  if (!error) return true;
  if (isMissingTable(error)) return false;
  throw dbError(error, "probe bke_events");
}

export const MIGRATION_HINT =
  "tables missing: run supabase/migrations/0001_init.sql in the Supabase SQL editor, then re-run.";
