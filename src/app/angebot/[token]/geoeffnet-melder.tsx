"use client";

import { useEffect } from "react";

/** Meldet einmal pro Aufruf an die App, dass das Angebot geöffnet wurde (läuft nur in einem echten Browser). */
export function GeoeffnetMelder({ token }: { token: string }) {
  useEffect(() => {
    const schluessel = `angebot-gesehen-${token}`;
    try {
      if (sessionStorage.getItem(schluessel)) return;
      sessionStorage.setItem(schluessel, "1");
    } catch {
      // Speicher gesperrt: dann eben bei jedem Laden melden
    }
    void fetch(`/angebot/${token}/gesehen`, { method: "POST", keepalive: true }).catch(() => {});
  }, [token]);
  return null;
}
