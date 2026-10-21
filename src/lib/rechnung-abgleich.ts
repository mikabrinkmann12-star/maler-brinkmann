/** Wie alt darf der letzte Abgleich mit der Buchhaltung sein, bevor das Öffnen der Rechnung neu abgleicht (Minuten)? */
export const ABGLEICH_MAX_ALTER_MIN = 5;

/**
 * Soll die Rechnungsseite beim Öffnen automatisch mit der Buchhaltung abgleichen? Nur übertragene Rechnungen.
 *  - Fehlt die Datei, obwohl die Rechnung fertig ist (offen/bezahlt): ja, sofort (Nachholen nach einem Fehler beim Übertragen).
 *  - Bezahlt oder storniert und Datei da: nein, da ändert sich nichts mehr.
 *  - Entwurf oder offen: ja, wenn der letzte Abgleich länger als fünf Minuten her ist (Status, Zahlung, Nummer, Datei).
 */
export function abgleichFaellig(
  r: { status: string; lexwareStatus: string | null; hatDatei: boolean; abgeglichenAm: string | null },
  jetztMs: number = Date.now(),
): boolean {
  if (r.status !== "uebertragen") return false;
  const fertig = r.lexwareStatus === "open" || r.lexwareStatus === "paid";
  if (fertig && !r.hatDatei) return true;
  if (r.lexwareStatus === "paid" || r.lexwareStatus === "voided") return false;
  if (!r.abgeglichenAm) return true;
  const letzter = Date.parse(r.abgeglichenAm);
  return Number.isNaN(letzter) || jetztMs - letzter > ABGLEICH_MAX_ALTER_MIN * 60_000;
}
