import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  cacheLife: {
    // Transactional data (entries, invoices, payments, stock, dashboards).
    // Every save expires the matching tags instantly; these timings are only for
    // other people's changes: browsers keep a copy for 1 min, the server refreshes
    // in the background after 5 min.
    live: { stale: 60, revalidate: 300, expire: 86400 },
  },
  // The dev badge sits on top of the phone tab bar; turn it off.
  devIndicators: false,
  experimental: {
    // Hold & retry navigations and Server Actions while a phone is briefly offline.
    useOffline: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      // Inbound entry now happens on the Inbound page itself.
      { source: "/inbound/new", destination: "/inbound", permanent: false },
      { source: "/inbound/:id/edit", destination: "/inbound", permanent: false },
      { source: "/settings/suppliers", destination: "/suppliers", permanent: false },
      // Production and dispatch entry also happen on their own pages now (query strings are kept).
      { source: "/production/new", destination: "/production", permanent: false },
      { source: "/production/:id/edit", destination: "/production", permanent: false },
      { source: "/dispatch/new", destination: "/dispatch", permanent: false },
      { source: "/dispatch/:id/edit", destination: "/dispatch", permanent: false },
      // Invoices are now called Orders.
      { source: "/invoices", destination: "/orders", permanent: false },
      { source: "/invoices/:path*", destination: "/orders/:path*", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
