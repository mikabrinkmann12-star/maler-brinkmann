// Vorschlag für die nächste Projektnummer (auch im Browser nutzbar).
//
// Format wie in Plancraft: „P-(2400)603“. Der Kopf „P-(2400)“ ist dort fest eingetragen (kein Jahr!) und bleibt
// (Mika, 18.10.2026: weiterzählen wie Plancraft). Die laufende Nummer zählt über die Jahre ohne Neustart weiter
// (höchste vorhandene + 1). Startwert: die höchste in Plancraft vergebene Nummer (602, Stand 18.10.2026);
// der Admin kann sie unter Einstellungen → Nummernkreise ändern.

/** Fester Kopf der Projektnummern (wie in Plancraft). */
export const PROJEKT_PRAEFIX = "P-(2400)";

/** Höchste in Plancraft vergebene Projektnummer (Stand 18.10.2026), solange der Admin nichts anderes einträgt. */
export const PROJEKT_START_STANDARD = 602;

const SCHEMA = /^P-\((\d{4})\)(\d{1,6})$/i;

/** Laufende Nummer aus einer Projektnummer oder einer reinen Zahl („P-(2400)447“ oder „447“); sonst null. */
export function laufendeNummer(text: string | null | undefined): number | null {
  const t = text?.trim();
  if (!t) return null;
  const treffer = SCHEMA.exec(t);
  if (treffer) return Number(treffer[2]);
  return /^\d{1,6}$/.test(t) ? Number(t) : null;
}

/**
 * Nächste Projektnummer.
 * @param bestehende alle vorhandenen Projektnummern (auch archivierte)
 * @param startNummer höchste schon vergebene laufende Nummer aus Plancraft (Einstellung)
 */
export function naechsteProjektnummer(
  bestehende: readonly (string | null | undefined)[],
  startNummer: number,
): string {
  const vorhanden = new Set(bestehende.map((n) => n?.trim().toUpperCase()).filter((n): n is string => Boolean(n)));
  let hoechste = Math.max(0, startNummer);
  for (const n of vorhanden) {
    const nr = SCHEMA.test(n) ? laufendeNummer(n) : null;
    if (nr !== null) hoechste = Math.max(hoechste, nr);
  }
  let nummer = hoechste + 1;
  let vorschlag = `${PROJEKT_PRAEFIX}${String(nummer).padStart(3, "0")}`;
  // Sicherheitsnetz: nie eine schon vorhandene Nummer vorschlagen
  while (vorhanden.has(vorschlag.toUpperCase())) {
    nummer++;
    vorschlag = `${PROJEKT_PRAEFIX}${String(nummer).padStart(3, "0")}`;
  }
  return vorschlag;
}
