import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

// Seiten, die ohne Login erreichbar sind.
const OEFFENTLICHE_PFADE = ["/login"];

/**
 * Läuft vor jeder Seite:
 * 1. Erneuert die Supabase-Session (Cookies), damit man eingeloggt bleibt.
 * 2. Schickt Nicht-Eingeloggte zur Login-Seite.
 * Rollen werden hier NICHT geprüft, das machen requireRole() und RLS.
 */
export async function proxy(request: NextRequest) {
  let antwort = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(zuSetzen, header) {
        zuSetzen.forEach(({ name, value }) => request.cookies.set(name, value));
        antwort = NextResponse.next({ request });
        zuSetzen.forEach(({ name, value, options }) =>
          antwort.cookies.set(name, value, options),
        );
        Object.entries(header ?? {}).forEach(([schluessel, wert]) =>
          antwort.headers.set(schluessel, wert),
        );
      },
    },
  });

  // Wichtig: getClaims() prüft das Token und erneuert es bei Bedarf.
  const { data } = await supabase.auth.getClaims();
  const eingeloggt = Boolean(data?.claims?.sub);

  const pfad = request.nextUrl.pathname;
  const oeffentlich = OEFFENTLICHE_PFADE.some(
    (p) => pfad === p || pfad.startsWith(`${p}/`),
  );

  if (!eingeloggt && !oeffentlich) {
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/login";
    ziel.search = "";
    const umleitung = NextResponse.redirect(ziel);
    antwort.cookies.getAll().forEach((cookie) => umleitung.cookies.set(cookie));
    return umleitung;
  }

  return antwort;
}

export const config = {
  matcher: [
    // Alles außer statischen Dateien, Icons, PWA-Dateien, /api/version und /api/cron (Zeitplan-Aufrufe von Vercel, eigene Prüfung mit CRON_SECRET)
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|api/version|api/cron/|api/v1|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
