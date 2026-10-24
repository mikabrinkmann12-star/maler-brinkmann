// Eigene Rechnungen (die App vergibt Nummer und PDF selbst, seit 24.10.2026). Reine Logik, auch im Browser nutzbar.
// Der Steuerberater von Ralf muss das Verfahren vor dem echten Einsatz bestätigen (GoBD, ab 2028 E-Rechnung).

import type { Firma } from "@/lib/firma";

/** Nummernkreis aus den Einstellungen: Kürzel und Startnummer (gilt nur für die erste Rechnung eines Jahres). */
export const RECHNUNG_PRAEFIX_STANDARD = "R-";

/** So sieht die nächste Nummer aus: „R-2026-0001“. Spiegelt die Datenbank-Funktion `rechnung_finalisieren`. */
export function rechnungsnummerBeispiel(praefix: string, jahr: number, laufend: number): string {
  return `${praefix.trim() || RECHNUNG_PRAEFIX_STANDARD}${jahr}-${String(laufend).padStart(4, "0")}`;
}

/** Kürzel prüfen: höchstens 10 Zeichen aus Buchstaben, Ziffern, Bindestrich, Schrägstrich, Punkt und Klammern. */
export function praefixGueltig(wert: string): boolean {
  return /^[A-Za-z0-9\-/.()]{1,10}$/.test(wert.trim());
}

/**
 * Pflichtangaben nach § 14 UStG, die die App prüfen kann, bevor sie eine Rechnung fertigstellt. Leer = alles da.
 * Nicht geprüft werden können Inhalte wie die Leistungsbeschreibung (Positionen) und die Steuernummer des Kunden bei Reverse-Charge.
 */
export function pflichtangabenFehlen(firma: Firma, anschrift: string[], reverseCharge: boolean): string[] {
  const fehlt: string[] = [];
  if (!firma.name.trim()) fehlt.push("Firmenname");
  if (!firma.strasse.trim() || !firma.plz.trim() || !firma.ort.trim()) fehlt.push("Firmenanschrift (Straße, PLZ, Ort)");
  if (!firma.steuernummer.trim() && !firma.ustid.trim()) fehlt.push("Steuernummer oder USt-IdNr. der Firma");
  if (anschrift.filter((z) => z.trim()).length < 2) fehlt.push("Anschrift des Kunden (Name und Straße/Ort)");
  void reverseCharge;
  return fehlt;
}

/** Hinweis (kein Hindernis): Bei Reverse-Charge gehört die USt-IdNr. des Kunden auf die Rechnung, die App speichert sie noch nicht. */
export function reverseChargeHinweis(reverseCharge: boolean): string | null {
  return reverseCharge
    ? "Bei Reverse-Charge (§ 13b UStG) gehört die USt-IdNr. des Kunden auf die Rechnung. Die App speichert sie noch nicht; bitte mit dem Steuerberater klären."
    : null;
}

/** Fälligkeitsdatum (JJJJ-MM-TT): Rechnungsdatum plus Zahlungsziel in Tagen. */
export function faelligkeitsDatum(rechnungsdatum: string, zahlungszielTage: number): string {
  const d = new Date(`${rechnungsdatum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + zahlungszielTage);
  return d.toISOString().slice(0, 10);
}
