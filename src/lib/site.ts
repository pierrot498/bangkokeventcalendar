// Canonical site URL + brand constants. NEXT_PUBLIC_SITE_URL is the single
// source of truth (sitemap, canonical, OG, JSON-LD, ICS links).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

export const BRAND = {
  sister: { name: "Run Club Bangkok", url: "https://www.runclubbangkok.com" },
} as const;

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

// Brand assets (concept "01 Prang page", public/brand/final/).
export const LOGO = {
  wordmark: "/brand/final/logo.svg", // 1200x400 lockup
  mark512: "/brand/final/logo-mark-512.png", // Organization JSON-LD logo
  og: "/brand/final/og-default.png", // 1200x630 default share image
} as const;
