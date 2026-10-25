export type EventStatus = "published" | "draft" | "cancelled";

export type EventRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  category_slug: string;
  subcategory_slug: string | null;
  tags: string[] | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  timezone: string;
  venue_id: string | null;
  venue_name: string | null;
  area: string | null;
  address: string | null;
  price_text: string | null;
  is_free: boolean;
  ticket_url: string | null;
  source_url: string | null;
  image_url: string | null;
  organizer: string | null;
  status: EventStatus;
  featured: boolean;
  updated_at: string;
};

export type VenueRow = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  url: string | null;
  description: string | null;
};

export type PostRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  body_md: string;
  cover_image_url: string | null;
  tags: string[] | null;
  category: string | null;
  published_at: string;
  updated_at: string;
};

export type SourceRow = {
  id: string;
  slug: string;
  name: string;
  url: string;
  kind: string | null;
  category_slug: string | null;
  notes: string | null;
  last_checked_at: string | null;
};
