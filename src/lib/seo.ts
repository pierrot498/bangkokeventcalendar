import type { Metadata } from "next";
import { LOGO, SITE_URL } from "./site";
import { t } from "./i18n";

// Common metadata factory (adapted from runclubbangkok's pageMetadata):
// title + description, canonical, Open Graph and Twitter card.
const BRAND_SUFFIX = ` | ${t.site.name}`;
const BRAND_MAX_BASE_LENGTH = 55;

export function brandedTitle(title: string): string {
  if (title.includes(t.site.name) || title.length > BRAND_MAX_BASE_LENGTH) return title;
  return `${title}${BRAND_SUFFIX}`;
}

export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
  keywords?: string[];
}): Metadata {
  const title = brandedTitle(opts.title);
  const url = `${SITE_URL}${opts.path}`;
  // Fall back to the brand share image (1200x630) when the page has none.
  const images = opts.image
    ? [{ url: opts.image, alt: opts.title }]
    : [{ url: `${SITE_URL}${LOGO.og}`, width: 1200, height: 630, alt: t.site.name }];
  return {
    title: { absolute: title },
    description: opts.description,
    keywords: opts.keywords,
    alternates: { canonical: url },
    robots: opts.noindex ? { index: false, follow: true } : undefined,
    openGraph:
      opts.type === "article"
        ? {
            type: "article",
            url,
            title,
            description: opts.description,
            siteName: t.site.name,
            locale: "en_GB",
            images,
            publishedTime: opts.publishedTime,
            modifiedTime: opts.modifiedTime,
          }
        : { type: "website", url, title, description: opts.description, siteName: t.site.name, locale: "en_GB", images },
    twitter: {
      card: "summary_large_image",
      title,
      description: opts.description,
      images: [images[0].url],
    },
  };
}

// Stringify a Schema.org payload for a JSON-LD <script>; escapes `<`.
export function jsonLdString(payload: object): string {
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}
