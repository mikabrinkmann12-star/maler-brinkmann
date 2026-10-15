import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components bewusst aus: Fast jede Seite hängt vom eingeloggten
  // Nutzer ab und wird ohnehin pro Anfrage erzeugt. Das hält den Code einfach.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
