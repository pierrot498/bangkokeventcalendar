// Shared shapes for the daily jobs.

// One event as extracted from any source, before it is written.
export type NormalizedEvent = {
  source: string; // 'jsonld' | 'ical' | 'ai' | 'runclubbangkok'
  external_id: string;
  source_id: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  category_slug: string;
  subcategory_slug: string | null;
  tags: string[];
  starts_at: string; // ISO (UTC)
  ends_at: string | null;
  all_day: boolean;
  venue_name: string | null;
  area: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  price_text: string | null;
  is_free: boolean;
  ticket_url: string | null;
  source_url: string | null;
  image_url: string | null;
  organizer: string | null;
  cancelled: boolean;
};

// Raw event before category / Bangkok normalisation (parsers emit this).
export type RawEvent = {
  external_id?: string | null;
  title: string;
  summary?: string | null;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  tags?: string[];
  start: string; // ISO, naive local, or YYYY-MM-DD
  end?: string | null;
  all_day?: boolean;
  venue_name?: string | null;
  address?: string | null;
  locality?: string | null;
  area?: string | null;
  lat?: number | null;
  lng?: number | null;
  price_text?: string | null;
  is_free?: boolean | null;
  ticket_url?: string | null;
  url?: string | null;
  image_url?: string | null;
  organizer?: string | null;
  online?: boolean;
  cancelled?: boolean;
};

export type Stats = {
  fetched: number;
  inserted: number;
  updated: number;
  merged: number;
  deleted: number;
  skipped: number;
  flagged: number;
  [extra: string]: number | string | string[] | Record<string, unknown> | undefined;
};

export function emptyStats(): Stats {
  return { fetched: 0, inserted: 0, updated: 0, merged: 0, deleted: 0, skipped: 0, flagged: 0 };
}

// State shared between the steps of one run.
export type JobContext = {
  runId: string;
  dryRun: boolean;
  triggeredBy: string;
  tablesMissing: boolean;
  siteUrl: string;
  // Event slugs inserted / changed in this run (for IndexNow).
  changedSlugs: Set<string>;
  log: (line: string) => void;
};

export type StepResult = { status: "ok" | "skipped"; stats: Stats; summary: string };

export type Step = {
  name: string;
  label: string;
  run: (ctx: JobContext) => Promise<StepResult>;
};
