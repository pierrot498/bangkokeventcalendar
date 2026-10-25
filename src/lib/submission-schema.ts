import { z } from "zod";
import { ALL_CATEGORIES } from "./categories";

// Zod schema for POST /api/submissions/event (adapted from runclubbangkok).

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const optionalHttpUrl = z
  .preprocess(blankToUndefined, z.string().trim().max(500).refine(isHttpUrl, { message: "must be an http(s) URL" }).nullable().optional())
  .optional();

const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).nullable().optional()).optional();

const CATEGORY_SLUGS = ALL_CATEGORIES.map((c) => c.slug) as [string, ...string[]];

export const EventSubmissionSchema = z.object({
  title: z.string().trim().min(2).max(200),
  category_slug: z.preprocess(blankToUndefined, z.enum(CATEGORY_SLUGS).nullable().optional()).optional(),
  starts_at: z.string().datetime().nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
  venue_name: optionalText(200),
  area: optionalText(120),
  price_text: optionalText(120),
  is_free: z.boolean().nullable().optional(),
  ticket_url: optionalHttpUrl,
  image_url: optionalHttpUrl,
  description: optionalText(5000),
  organizer_name: optionalText(200),
  contact_email: z.preprocess(blankToUndefined, z.string().trim().email().max(200).nullable().optional()).optional(),
  source_url: optionalHttpUrl,
  // Honeypot: any value means a bot.
  website: z.string().max(500).optional(),
});

export type EventSubmissionInput = z.infer<typeof EventSubmissionSchema>;
