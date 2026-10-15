"use client";

import { useEffect, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  installAngebotMerken,
  installAngebotVergessen,
  istNeueVersion,
} from "@/lib/pwa";

const PRUEF_ABSTAND_MS = 5 * 60 * 1000; // alle 5 Minuten

/**
 * Läuft auf jeder Seite (im Root-Layout):
 * - meldet den Service Worker an,
 * - merkt sich Chromes Installations-Angebot (für „App installieren“),
 * - prüft regelmäßig /api/version und zeigt bei einem Update den Hinweis.
 */
export function PwaHelfer() {
  const [neueVersion, setNeueVersion] = useState(false);

  // Service Worker + Installations-Angebot
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Ohne Service Worker funktioniert die App trotzdem.
        });
    }
    window.addEventListener("beforeinstallprompt", installAngebotMerken);
    window.addEventListener("appinstalled", installAngebotVergessen);
    return () => {
      window.removeEventListener("beforeinstallprompt", installAngebotMerken);
      window.removeEventListener("appinstalled", installAngebotVergessen);
    };
  }, []);

  // Versionsprüfung: beim Start, beim Zurückholen der App und alle 5 Minuten
  useEffect(() => {
    let aktiv = true;

    async function pruefen() {
      if (document.visibilityState !== "visible") return;
      try {
        const antwort = await fetch("/api/version", { cache: "no-store" });
        if (!antwort.ok) return;
        const { version } = (await antwort.json()) as { version?: unknown };
        if (aktiv && istNeueVersion(version)) setNeueVersion(true);
      } catch {
        // Kein Netz auf der Baustelle: später nochmal versuchen.
      }
    }

    pruefen();
    const timer = window.setInterval(pruefen, PRUEF_ABSTAND_MS);
    document.addEventListener("visibilitychange", pruefen);
    window.addEventListener("online", pruefen);
    return () => {
      aktiv = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", pruefen);
      window.removeEventListener("online", pruefen);
    };
  }, []);

  if (!neueVersion) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-50 flex items-center justify-between gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg md:inset-x-auto md:right-6 md:bottom-6 md:w-96"
    >
      <span className="flex items-center gap-2 font-medium">
        <RefreshCwIcon className="size-5" />
        Neue Version
      </span>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={() => window.location.reload()}
      >
        Neu laden
      </Button>
    </div>
  );
}
