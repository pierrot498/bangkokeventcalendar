// Claude extraction for unstructured event pages (same approach as
// runclubbangkok's src/lib/agents/claude.ts). Skipped when
// ANTHROPIC_API_KEY is unset.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { RawEvent } from "../types";

export const AI_MODEL = "claude-opus-5-5";

const Extracted = z.object({
  events: z.array(
    z.object({
      title: z.string(),
      summary: z.string().nullish(),
      description: z.string().nullish(),
      category: z.string().nullish(),
      subcategory: z.string().nullish(),
      tags: z.array(z.string()).nullish(),
      starts_at: z.string(),
      ends_at: z.string().nullish(),
      all_day: z.boolean().nullish(),
      venue_name: z.string().nullish(),
      area: z.string().nullish(),
      address: z.string().nullish(),
      price_text: z.string().nullish(),
      is_free: z.boolean().nullish(),
      ticket_url: z.string().nullish(),
      image_url: z.string().nullish(),
      organizer: z.string().nullish(),
    }),
  ),
});

export function aiAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM = [
  "You extract upcoming public events in Bangkok, Thailand from the text of a web page and return JSON.",
  "Only include events with a concrete date that take place in Bangkok or its immediate suburbs (Nonthaburi, Samut Prakan, Pathum Thani).",
  "starts_at / ends_at: ISO 8601 with the +07:00 offset (e.g. 2026-11-14T19:00:00+07:00); use YYYY-MM-DD with all_day=true when no time is given.",
  `Resolve relative or year-less dates against today's date in Bangkok, given in the request.`,
  "category is one of: concerts, nightlife, food-drink, art-culture, markets, festivals, family, business-tech, wellness, sports, other.",
  "subcategory (sports only) is one of: running, padel, cycling, triathlon, hyrox, football, muay-thai, yoga, golf, tennis, pickleball, basketball, swimming, climbing.",
  "Copy facts from the page only; leave a field null rather than guessing. summary is one sentence.",
  'Reply with JSON only, no prose and no code fences: {"events": [...]}. Return {"events": []} when there are none.',
].join("\n");

export async function extractEventsWithClaude(pageText: string, pageUrl: string, todayBkk: string): Promise<RawEvent[]> {
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Today in Bangkok: ${todayBkk}\nPage URL: ${pageUrl}\n\nPage text:\n${pageText}`,
      },
    ],
  });
  if (resp.stop_reason === "refusal") throw new Error("model declined the extraction");
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const parsed = Extracted.parse(JSON.parse(fenced ? fenced[1] : text));
  return parsed.events.map((e) => ({
    title: e.title,
    summary: e.summary ?? null,
    description: e.description ?? null,
    category: e.category ?? null,
    subcategory: e.subcategory ?? null,
    tags: e.tags ?? [],
    start: e.starts_at,
    end: e.ends_at ?? null,
    all_day: e.all_day ?? undefined,
    venue_name: e.venue_name ?? null,
    area: e.area ?? null,
    address: e.address ?? null,
    price_text: e.price_text ?? null,
    is_free: e.is_free ?? null,
    ticket_url: e.ticket_url ?? null,
    image_url: e.image_url ?? null,
    organizer: e.organizer ?? null,
    url: pageUrl,
  }));
}
