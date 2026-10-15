import type { NextConfig } from "next";

// Kennung dieser Version. Auf Vercel ändert sie sich bei jedem Deployment.
// Die App vergleicht sie mit /api/version und zeigt dann „Neue Version – neu laden“.
// Lokal bleibt sie fest ("lokal"), dort erscheint der Hinweis also nie.
const appVersion =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "lokal";

const nextConfig: NextConfig = {
  // Cache Components bewusst aus: Fast jede Seite hängt vom eingeloggten
  // Nutzer ab und wird ohnehin pro Anfrage erzeugt. Das hält den Code einfach.
  cacheComponents: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // Grundlegende Sicherheits-Header für alle Seiten
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Service Worker nie zwischenspeichern, damit Änderungen sofort ankommen
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
