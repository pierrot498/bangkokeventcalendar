-- Bangkok Event Calendar schema.
--
-- Lives in the SAME Supabase project as runclubbangkok, so every object is
-- prefixed `bke_` (tables, indexes, policies, the trigger function) and this
-- file never touches the `run_*` tables or runclubbangkok's set_updated_at().
--
-- Idempotent: safe to run again in the Supabase SQL editor. Tables use
-- `create table if not exists` followed by `add column if not exists` so a
-- re-run backfills columns added later; policies are dropped and recreated;
-- the category seed is an upsert.
--
-- Also includes the daily-jobs columns (source / external_id / dedupe_key /
-- last_seen_at / duplicate_of / needs_review) and the bke_job_runs log.

create extension if not exists "pgcrypto";

-- Updated-at trigger function (bke_ prefixed: runclubbangkok owns the
-- unprefixed set_updated_at() in this project).
create or replace function bke_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- bke_categories -------------------------------------------------------------

create table if not exists bke_categories (
  slug text primary key,
  name text not null,
  parent_slug text references bke_categories(slug) on delete set null,
  sort integer not null default 100,
  emoji text,
  icon text,
  description text
);

alter table bke_categories add column if not exists parent_slug text;
alter table bke_categories add column if not exists sort integer not null default 100;
alter table bke_categories add column if not exists emoji text;
alter table bke_categories add column if not exists icon text;
alter table bke_categories add column if not exists description text;

create index if not exists bke_categories_parent_idx on bke_categories(parent_slug);

-- bke_venues -----------------------------------------------------------------

create table if not exists bke_venues (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  area text,
  address text,
  lat double precision,
  lng double precision,
  url text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table bke_venues add column if not exists area text;
alter table bke_venues add column if not exists address text;
alter table bke_venues add column if not exists lat double precision;
alter table bke_venues add column if not exists lng double precision;
alter table bke_venues add column if not exists url text;
alter table bke_venues add column if not exists description text;
alter table bke_venues add column if not exists created_at timestamptz not null default now();
alter table bke_venues add column if not exists updated_at timestamptz not null default now();

drop trigger if exists bke_venues_updated on bke_venues;
create trigger bke_venues_updated before update on bke_venues
for each row execute function bke_set_updated_at();

-- bke_events -----------------------------------------------------------------

create table if not exists bke_events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text,
  description text, -- markdown
  category_slug text not null references bke_categories(slug),
  subcategory_slug text references bke_categories(slug),
  tags text[] not null default array[]::text[],
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  timezone text not null default 'Asia/Bangkok',
  venue_id uuid references bke_venues(id) on delete set null,
  venue_name text,
  area text,
  address text,
  price_text text,
  is_free boolean not null default false,
  ticket_url text,
  source_url text,
  image_url text,
  organizer text,
  status text not null default 'published'
    check (status in ('published', 'draft', 'cancelled')),
  featured boolean not null default false,
  -- Daily jobs (scripts/run-job.ts). `source` = 'seed' | 'manual' |
  -- 'jsonld' | 'ical' | 'ai' | 'runclubbangkok' | …; (source, external_id)
  -- identifies a row fetched from a source so re-runs update it.
  source text not null default 'manual',
  external_id text,
  source_id uuid,
  dedupe_key text,
  last_seen_at timestamptz,
  duplicate_of uuid references bke_events(id) on delete set null,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table bke_events add column if not exists summary text;
alter table bke_events add column if not exists description text;
alter table bke_events add column if not exists subcategory_slug text;
alter table bke_events add column if not exists tags text[] not null default array[]::text[];
alter table bke_events add column if not exists ends_at timestamptz;
alter table bke_events add column if not exists all_day boolean not null default false;
alter table bke_events add column if not exists timezone text not null default 'Asia/Bangkok';
alter table bke_events add column if not exists venue_id uuid;
alter table bke_events add column if not exists venue_name text;
alter table bke_events add column if not exists area text;
alter table bke_events add column if not exists address text;
alter table bke_events add column if not exists price_text text;
alter table bke_events add column if not exists is_free boolean not null default false;
alter table bke_events add column if not exists ticket_url text;
alter table bke_events add column if not exists source_url text;
alter table bke_events add column if not exists image_url text;
alter table bke_events add column if not exists organizer text;
alter table bke_events add column if not exists status text not null default 'published';
alter table bke_events add column if not exists featured boolean not null default false;
alter table bke_events add column if not exists source text not null default 'manual';
alter table bke_events add column if not exists external_id text;
alter table bke_events add column if not exists source_id uuid;
alter table bke_events add column if not exists dedupe_key text;
alter table bke_events add column if not exists last_seen_at timestamptz;
alter table bke_events add column if not exists duplicate_of uuid;
alter table bke_events add column if not exists needs_review boolean not null default false;
alter table bke_events add column if not exists created_at timestamptz not null default now();
alter table bke_events add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bke_events_subcategory_slug_fkey') then
    alter table bke_events add constraint bke_events_subcategory_slug_fkey
      foreign key (subcategory_slug) references bke_categories(slug);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bke_events_venue_id_fkey') then
    alter table bke_events add constraint bke_events_venue_id_fkey
      foreign key (venue_id) references bke_venues(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bke_events_duplicate_of_fkey') then
    alter table bke_events add constraint bke_events_duplicate_of_fkey
      foreign key (duplicate_of) references bke_events(id) on delete set null;
  end if;
  -- Plain (non-partial) unique constraint so PostgREST upserts can target
  -- it; NULL external_ids (seeded / manual rows) never collide.
  if not exists (select 1 from pg_constraint where conname = 'bke_events_source_external_id_key') then
    alter table bke_events add constraint bke_events_source_external_id_key
      unique (source, external_id);
  end if;
end $$;

create index if not exists bke_events_starts_at_idx on bke_events(starts_at);
create index if not exists bke_events_ends_at_idx on bke_events(ends_at);
create index if not exists bke_events_category_idx on bke_events(category_slug, starts_at);
create index if not exists bke_events_subcategory_idx on bke_events(subcategory_slug, starts_at);
create index if not exists bke_events_status_idx on bke_events(status);
create index if not exists bke_events_venue_idx on bke_events(venue_id);
create index if not exists bke_events_dedupe_key_idx on bke_events(dedupe_key);
create index if not exists bke_events_duplicate_of_idx on bke_events(duplicate_of)
  where duplicate_of is not null;

drop trigger if exists bke_events_updated on bke_events;
create trigger bke_events_updated before update on bke_events
for each row execute function bke_set_updated_at();

-- bke_posts (blog) -----------------------------------------------------------

create table if not exists bke_posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  body_md text not null default '',
  cover_image_url text,
  tags text[] not null default array[]::text[],
  category text,
  published_at timestamptz not null default now(),
  status text not null default 'published'
    check (status in ('published', 'draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table bke_posts add column if not exists description text;
alter table bke_posts add column if not exists body_md text not null default '';
alter table bke_posts add column if not exists cover_image_url text;
alter table bke_posts add column if not exists tags text[] not null default array[]::text[];
alter table bke_posts add column if not exists category text;
alter table bke_posts add column if not exists published_at timestamptz not null default now();
alter table bke_posts add column if not exists status text not null default 'published';
alter table bke_posts add column if not exists created_at timestamptz not null default now();
alter table bke_posts add column if not exists updated_at timestamptz not null default now();

create index if not exists bke_posts_published_idx on bke_posts(status, published_at desc);

drop trigger if exists bke_posts_updated on bke_posts;
create trigger bke_posts_updated before update on bke_posts
for each row execute function bke_set_updated_at();

-- bke_event_submissions (public /submit form) --------------------------------

create table if not exists bke_event_submissions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'spam')),
  title text not null,
  category_slug text,
  starts_at timestamptz,
  ends_at timestamptz,
  venue_name text,
  area text,
  price_text text,
  is_free boolean,
  ticket_url text,
  image_url text,
  description text,
  organizer_name text,
  contact_email text,
  source_url text,
  notes text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_notes text
);

create index if not exists bke_event_submissions_status_idx
  on bke_event_submissions(status, created_at desc);

-- bke_sources (calendar / source registry, also drives the daily fetch) ------

create table if not exists bke_sources (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  url text not null,
  kind text,          -- ticketing | venue | calendar | media | instagram | ical | …
  category_slug text references bke_categories(slug) on delete set null,
  notes text,
  feed_url text,      -- optional machine-readable URL (iCal / JSON-LD page) if different from url
  fetch_mode text not null default 'auto'
    check (fetch_mode in ('auto', 'jsonld', 'ical', 'ai', 'none')),
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_status text,
  last_event_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table bke_sources add column if not exists kind text;
alter table bke_sources add column if not exists category_slug text;
alter table bke_sources add column if not exists notes text;
alter table bke_sources add column if not exists feed_url text;
alter table bke_sources add column if not exists fetch_mode text not null default 'auto';
alter table bke_sources add column if not exists enabled boolean not null default true;
alter table bke_sources add column if not exists last_checked_at timestamptz;
alter table bke_sources add column if not exists last_status text;
alter table bke_sources add column if not exists last_event_count integer;
alter table bke_sources add column if not exists created_at timestamptz not null default now();
alter table bke_sources add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bke_events_source_id_fkey') then
    alter table bke_events add constraint bke_events_source_id_fkey
      foreign key (source_id) references bke_sources(id) on delete set null;
  end if;
end $$;

drop trigger if exists bke_sources_updated on bke_sources;
create trigger bke_sources_updated before update on bke_sources
for each row execute function bke_set_updated_at();

-- bke_job_runs (one row per job step; grouped by run_id) ---------------------

create table if not exists bke_job_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  job text not null,
  status text not null check (status in ('running', 'ok', 'failed', 'skipped')),
  triggered_by text,
  dry_run boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists bke_job_runs_started_idx on bke_job_runs(started_at desc);
create index if not exists bke_job_runs_run_idx on bke_job_runs(run_id);

-- RLS -------------------------------------------------------------------------
-- Anon can read published content; anon can only INSERT pending submissions;
-- everything else (writes, job logs, reading submissions) is service-role only
-- (service role bypasses RLS).

alter table bke_categories enable row level security;
alter table bke_venues enable row level security;
alter table bke_events enable row level security;
alter table bke_posts enable row level security;
alter table bke_event_submissions enable row level security;
alter table bke_sources enable row level security;
alter table bke_job_runs enable row level security;

drop policy if exists "bke_categories read all" on bke_categories;
create policy "bke_categories read all" on bke_categories for select using (true);

drop policy if exists "bke_venues read all" on bke_venues;
create policy "bke_venues read all" on bke_venues for select using (true);

drop policy if exists "bke_events read published" on bke_events;
create policy "bke_events read published" on bke_events
  for select using (status in ('published', 'cancelled') and duplicate_of is null);

drop policy if exists "bke_posts read published" on bke_posts;
create policy "bke_posts read published" on bke_posts
  for select using (status = 'published' and published_at <= now());

drop policy if exists "bke_sources read enabled" on bke_sources;
create policy "bke_sources read enabled" on bke_sources for select using (enabled = true);

drop policy if exists "bke_submissions insert anonymous" on bke_event_submissions;
create policy "bke_submissions insert anonymous" on bke_event_submissions
  for insert with check (status = 'pending');
-- No SELECT policy on submissions / job runs: anon can't read them.

grant select on bke_categories, bke_venues, bke_events, bke_posts, bke_sources to anon, authenticated;
grant insert on bke_event_submissions to anon, authenticated;

-- Seed categories ------------------------------------------------------------
-- Parents first (sports must exist before its subcategories reference it).

insert into bke_categories (slug, name, parent_slug, sort, emoji) values
  ('concerts',      'Concerts & Live Music', null, 10, '🎤'),
  ('nightlife',     'Nightlife & Parties',   null, 20, '🪩'),
  ('food-drink',    'Food & Drink',          null, 30, '🍜'),
  ('art-culture',   'Art & Culture',         null, 40, '🎨'),
  ('markets',       'Markets & Pop-ups',     null, 50, '🛍️'),
  ('festivals',     'Festivals',             null, 60, '🎉'),
  ('family',        'Family & Kids',         null, 70, '🧸'),
  ('business-tech', 'Business & Tech',       null, 80, '💼'),
  ('wellness',      'Wellness',              null, 90, '🌿'),
  ('sports',        'Sports',                null, 100, '🏅'),
  ('other',         'Other',                 null, 999, '✨')
on conflict (slug) do update set
  name = excluded.name, parent_slug = excluded.parent_slug,
  sort = excluded.sort, emoji = excluded.emoji;

insert into bke_categories (slug, name, parent_slug, sort, emoji) values
  ('running',     'Running',          'sports', 101, '🏃'),
  ('padel',       'Padel',            'sports', 102, '🎾'),
  ('cycling',     'Cycling',          'sports', 103, '🚴'),
  ('triathlon',   'Triathlon',        'sports', 104, '🏊'),
  ('hyrox',       'HYROX & Fitness',  'sports', 105, '🏋️'),
  ('football',    'Football',         'sports', 106, '⚽'),
  ('muay-thai',   'Muay Thai',        'sports', 107, '🥊'),
  ('yoga',        'Yoga',             'sports', 108, '🧘'),
  ('golf',        'Golf',             'sports', 109, '⛳'),
  ('tennis',      'Tennis',           'sports', 110, '🎾'),
  ('pickleball',  'Pickleball',       'sports', 111, '🏓'),
  ('basketball',  'Basketball',       'sports', 112, '🏀'),
  ('swimming',    'Swimming',         'sports', 113, '🏊'),
  ('climbing',    'Climbing',         'sports', 114, '🧗')
on conflict (slug) do update set
  name = excluded.name, parent_slug = excluded.parent_slug,
  sort = excluded.sort, emoji = excluded.emoji;
