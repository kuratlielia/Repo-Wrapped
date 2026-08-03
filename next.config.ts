import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Security headers applied to every response. Deliberately no strict CSP: the
// app relies on next/font, Tailwind inline styles, and client-side canvas
// export (html-to-image) plus the clipboard, which a naive CSP would break.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

// Wires the Cloudflare bindings (Agent DO, AI, vars) into `next dev` via
// getCloudflareContext(). No-op for production builds; safe to leave unawaited.
initOpenNextCloudflareForDev();
