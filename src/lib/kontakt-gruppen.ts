// Kontakte der Mitarbeiter-App: alphabetisch mit Buchstaben-Trennern (auch im Browser nutzbar).
import { kontaktName, type KontaktName } from "@/lib/projekt";

/** Sortierwort: Firma, sonst „Nachname Vorname“. */
export function sortierName(k: KontaktName): string {
  if (k.firmenname?.trim()) return k.firmenname.trim();
  return [k.nachname, k.vorname].filter(Boolean).join(" ").trim() || kontaktName(k);
}

/** Buchstabe für den Trenner; Ziffern und Sonderzeichen landen unter „#“. */
export function anfangsbuchstabe(name: string): string {
  const b = name.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
  return /[A-Z]/.test(b) ? b : "#";
}

export function nachBuchstabenGruppieren<T extends KontaktName>(kontakte: T[]): { buchstabe: string; kontakte: T[] }[] {
  const sortiert = [...kontakte].sort((a, b) => sortierName(a).localeCompare(sortierName(b), "de"));
  const gruppen: { buchstabe: string; kontakte: T[] }[] = [];
  for (const k of sortiert) {
    const b = anfangsbuchstabe(sortierName(k));
    const letzte = gruppen[gruppen.length - 1];
    if (letzte?.buchstabe === b) letzte.kontakte.push(k);
    else gruppen.push({ buchstabe: b, kontakte: [k] });
  }
  // „#“ ans Ende
  gruppen.sort((a, b) => (a.buchstabe === "#" ? 1 : b.buchstabe === "#" ? -1 : 0));
  return gruppen;
}
