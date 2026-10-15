import type { MetadataRoute } from "next";

// Web-App-Manifest: macht die App auf Android über Chrome → „App installieren“
// installierbar (eigenes Icon auf dem Homescreen, Vollbild ohne Adressleiste).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Maler Brinkmann",
    short_name: "Maler Brinkmann",
    description: "Handwerker-Software des Maler Betriebs Ralf Brinkmann",
    lang: "de",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
