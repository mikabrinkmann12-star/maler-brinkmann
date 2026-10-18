// Adressvorschläge beim Tippen (auch im Browser nutzbar): Umwandlung der Antwort von Photon (OpenStreetMap-Daten) in Felder,
// die unsere Formulare füllen: Straße mit Hausnummer, PLZ, Ort, Land.

export const STANDARD_LAND = "Deutschland";

/** Länder in der Auswahl (häufige Nachbarländer zuerst nach Deutschland); andere Länder aus Vorschlägen werden ergänzt. */
export const LAENDER = ["Deutschland", "Österreich", "Schweiz", "Niederlande", "Belgien", "Dänemark", "Luxemburg", "Polen", "Frankreich", "Italien", "Tschechien"] as const;

export type AdressVorschlag = { label: string; strasse: string; plz: string; ort: string; land: string; breite?: number; laenge?: number };

const LAND_NACH_CODE: Record<string, string> = {
  DE: "Deutschland", AT: "Österreich", CH: "Schweiz", NL: "Niederlande", BE: "Belgien", DK: "Dänemark",
  LU: "Luxemburg", PL: "Polen", FR: "Frankreich", IT: "Italien", CZ: "Tschechien",
};

type PhotonEigenschaften = {
  name?: string; street?: string; housenumber?: string; postcode?: string;
  city?: string; town?: string; village?: string; locality?: string; district?: string;
  country?: string; countrycode?: string; type?: string;
};
type PhotonAntwort = { features?: { properties?: PhotonEigenschaften; geometry?: { coordinates?: number[] } }[] } | null | undefined;

/** Antwort von Photon → Vorschläge (ohne Doppelte, höchstens `max`). Einträge ohne Straße werden übersprungen. */
export function vorschlaegeAusPhoton(antwort: PhotonAntwort, max = 6): AdressVorschlag[] {
  const ergebnis: AdressVorschlag[] = [];
  const gesehen = new Set<string>();
  for (const f of antwort?.features ?? []) {
    const p = f.properties;
    if (!p) continue;
    const strassenName = p.street || (p.type === "street" ? p.name : "") || "";
    if (!strassenName) continue;
    const strasse = [strassenName, p.housenumber].filter(Boolean).join(" ");
    const ort = p.city || p.town || p.village || p.locality || p.district || "";
    const plz = p.postcode ?? "";
    const land = (p.countrycode && LAND_NACH_CODE[p.countrycode.toUpperCase()]) || p.country || STANDARD_LAND;
    const label = [strasse, [plz, ort].filter(Boolean).join(" "), land].filter(Boolean).join(", ");
    if (gesehen.has(label)) continue;
    gesehen.add(label);
    const [laenge, breite] = f.geometry?.coordinates ?? [];
    ergebnis.push({ label, strasse, plz, ort, land, ...(typeof breite === "number" && typeof laenge === "number" ? { breite, laenge } : {}) });
    if (ergebnis.length >= max) break;
  }
  return ergebnis;
}

/** Suchtext für die Adresssuche: Leerzeichen bereinigen, mindestens 3 Zeichen, höchstens 100. */
export function adressSuchtext(roh: string | null | undefined): string {
  const t = (roh ?? "").replace(/\s+/g, " ").trim();
  return t.length >= 3 ? t.slice(0, 100) : "";
}

/**
 * Postalischer Ort aus der Antwort von Nominatim (Rückwärtssuche): die Gemeinde, z. B. „Saterland“ statt des Ortsteils „Scharrel“.
 * Leer, wenn die Antwort nichts Brauchbares enthält.
 */
export function ortAusNominatim(antwort: { address?: Record<string, string> } | null | undefined): string {
  const a = antwort?.address ?? {};
  return a.municipality || a.city || a.town || a.village || "";
}
