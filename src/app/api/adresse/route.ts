import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { adressSuchtext, ortAusNominatim, vorschlaegeAusPhoton } from "@/lib/adresse";

// Adressvorschläge für Formulare (Projekt, Kontakt). Nur für eingeloggte Nutzer; die App fragt Photon (kostenlos, OpenStreetMap)
// von hier aus, damit der Browser keine Daten an Dritte schickt und die Adresse des Rechners nicht weitergegeben wird.
// Es geht nur der getippte Adressteil raus, keine Namen oder Kundendaten.
//   GET /api/adresse?q=Hambierich 39           → Vorschläge
//   GET /api/adresse?breite=53.06&laenge=7.7   → Gemeinde des Punkts (z. B. „Saterland“ statt Ortsteil), einmal nach der Auswahl

export const dynamic = "force-dynamic";

const KENNUNG = { "User-Agent": "maler-brinkmann-app (Handwerker-Software)" };
/** Saterland: bevorzugt Treffer aus der Gegend. */
const MITTE = { breite: 53.03, laenge: 7.68 };

export async function GET(anfrage: Request) {
  await requireUser();
  const url = new URL(anfrage.url);

  const breite = Number(url.searchParams.get("breite"));
  const laenge = Number(url.searchParams.get("laenge"));
  if (url.searchParams.has("breite")) {
    if (!Number.isFinite(breite) || !Number.isFinite(laenge) || Math.abs(breite) > 90 || Math.abs(laenge) > 180) return NextResponse.json({ ort: "" });
    try {
      const antwort = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&accept-language=de&lat=${breite}&lon=${laenge}`,
        { signal: AbortSignal.timeout(4000), headers: KENNUNG },
      );
      return NextResponse.json({ ort: antwort.ok ? ortAusNominatim(await antwort.json()) : "" });
    } catch {
      return NextResponse.json({ ort: "" });
    }
  }

  const q = adressSuchtext(url.searchParams.get("q"));
  if (!q) return NextResponse.json([]);
  const adresse =
    "https://photon.komoot.io/api/?" +
    new URLSearchParams({ q, lang: "de", limit: "10", lat: String(MITTE.breite), lon: String(MITTE.laenge) }).toString() +
    "&layer=house&layer=street";
  try {
    const antwort = await fetch(adresse, { signal: AbortSignal.timeout(4000), headers: KENNUNG });
    if (!antwort.ok) return NextResponse.json([]);
    return NextResponse.json(vorschlaegeAusPhoton(await antwort.json()), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json([]);
  }
}
