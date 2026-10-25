import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Adapted from runclubbangkok/next.config.ts (minus next-intl and the
// runclub-specific redirects).
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin file tracing to this project (several lockfiles live higher up).
  outputFileTracingRoot: projectRoot,
  poweredByHeader: false,
  // Event images come from many third-party hosts (ticketing sites, venue
  // CDNs, Instagram), so cards use plain <img loading="lazy"> instead of the
  // Next image optimizer and no remotePatterns are needed.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
