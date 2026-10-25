import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import { LOGO, SITE_URL } from "@/lib/site";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${t.site.name}: what's on in Bangkok`, template: `%s | ${t.site.name}` },
  description: t.site.description,
  applicationName: t.site.name,
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: SITE_URL,
    types: { "text/calendar": `${SITE_URL}/api/calendar.ics` },
  },
  openGraph: {
    type: "website",
    siteName: t.site.name,
    locale: "en_GB",
    url: SITE_URL,
    title: t.site.name,
    description: t.site.description,
    images: [{ url: `${SITE_URL}${LOGO.og}`, width: 1200, height: 630, alt: t.site.name }],
  },
  twitter: { card: "summary_large_image", title: t.site.name, description: t.site.description, images: [`${SITE_URL}${LOGO.og}`] },
};

export const viewport: Viewport = {
  themeColor: "#E30613",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": `${SITE_URL}/#organization`,
                name: t.site.name,
                url: SITE_URL,
                // Google picks the search-result logo from this URL.
                logo: { "@type": "ImageObject", url: `${SITE_URL}${LOGO.mark512}`, width: 512, height: 512 },
              },
              {
                "@type": "WebSite",
                "@id": `${SITE_URL}/#website`,
                name: t.site.name,
                url: SITE_URL,
                description: t.site.description,
                publisher: { "@id": `${SITE_URL}/#organization` },
              },
            ],
          }}
        />
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
