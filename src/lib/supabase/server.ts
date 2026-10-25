import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Public read client. Prefers the anon key (RLS enforces the published
// filter). If only the service-role key is configured (it is server-only,
// never NEXT_PUBLIC_), fall back to it so reads still work; every public
// query in src/lib/queries.ts filters status/duplicate_of explicitly, so the
// result is the same as under RLS.
let warned = false;
export function getSupabasePublic(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = anon || service;
  if (!url || !key) {
    if (!warned) {
      warned = true;
      console.warn("[supabase] env missing: public pages render empty until NEXT_PUBLIC_SUPABASE_URL + a key are set.");
    }
    return null;
  }
  if (!anon && !warned) {
    warned = true;
    console.warn("[supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY missing: public reads use the service-role key (server-only).");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Service-role client for server-side writes (submissions, revalidation jobs).
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Submissions: service role when available (no anon INSERT policy needed),
// else the anon client against the "insert pending" policy.
export function getSupabaseForSubmissions(): SupabaseClient | null {
  return getSupabaseAdmin() ?? getSupabasePublic();
}

// PostgREST / Postgres errors meaning "the bke_ tables aren't there yet".
export function isMissingTableError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    /does not exist|Could not find the table|schema cache/i.test(err.message ?? "")
  );
}
