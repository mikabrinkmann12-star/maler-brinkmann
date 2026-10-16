// Vorschlag für die nächste Projektnummer (auch im Browser nutzbar).
//
// Format wie in Plancraft (Mika, 16.10.2026): „P-(JJ00)NNN“, z. B. P-(2600)448. In der Klammer steht das
// Jahr (2 Ziffern) und „00“. Die laufende Nummer zählt über die Jahre ohne Neustart weiter
// (höchste vorhandene + 1). Startwert: die höchste in Plancraft vergebene Nummer, die der Admin in den
// Einstellungen („Nummernkreise“) einträgt, damit sich Nummern nicht mit alten überschneiden.

const SCHEMA = /^P-\((\d{2})00\)(\d{1,6})$/i;

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
 * @param startNummer höchste schon vergebene laufende Nummer aus Plancraft (Einstellung), 0 = unbekannt
 */
export function naechsteProjektnummer(
  bestehende: readonly (string | null | undefined)[],
  startNummer: number,
  jahr: number,
): string {
  const vorhanden = new Set(bestehende.map((n) => n?.trim().toUpperCase()).filter((n): n is string => Boolean(n)));
  let hoechste = Math.max(0, startNummer);
  for (const n of vorhanden) {
    const nr = SCHEMA.test(n) ? laufendeNummer(n) : null;
    if (nr !== null) hoechste = Math.max(hoechste, nr);
  }
  const yy = String(jahr % 100).padStart(2, "0");
  let nummer = hoechste + 1;
  let vorschlag = `P-(${yy}00)${String(nummer).padStart(3, "0")}`;
  // Sicherheitsnetz: nie eine schon vorhandene Nummer vorschlagen
  while (vorhanden.has(vorschlag.toUpperCase())) {
    nummer++;
    vorschlag = `P-(${yy}00)${String(nummer).padStart(3, "0")}`;
  }
  return vorschlag;
}
