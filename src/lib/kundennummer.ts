// Vorschlag für die nächste Kundennummer (auch im Browser nutzbar).
//
// Regel (Mika, 18.10.2026, nach dem Blick in die Nummernkreise von Plancraft): „KD-“ + laufende Nummer, die einfach
// weiterzählt, ohne Jahr, z. B. KD-241351. In Plancraft ist KD-241351 die nächste Nummer. Die höchste vorhandene Nummer
// + 1 zählt; gibt es noch keine, beginnt es bei dieser Plancraft-Nummer. Nummern werden nie wiederverwendet:
// Es zählen ALLE Kontakte, auch archivierte.
//
// Hinweis zur „Regelkonformität“: Gesetzlich vorgeschrieben ist eine lückenlose, eindeutige Nummer
// nur bei Rechnungen (§ 14 UStG, GoBD). Die vergibt Lexware, nicht diese Funktion. Eine Kundennummer
// muss nur eindeutig sein.

/** Erkennt „KD-241350“ und „KD241350“ (mit oder ohne Bindestrich), mindestens 5 Ziffern. */
const SCHEMA = /^KD-?(\d{5,9})$/i;

/** Nächste Nummer in Plancraft zum Zeitpunkt der Umstellung; Ausgangspunkt, solange es keine höhere gibt. */
export const KUNDENNUMMER_START = 241351;

export const KUNDENNUMMER_BEISPIEL = `KD-${KUNDENNUMMER_START}`;

const format = (nummer: number) => `KD-${String(nummer).padStart(5, "0")}`;

export function naechsteKundennummer(bestehende: readonly (string | null | undefined)[]): string {
  const vorhanden = new Set(bestehende.map((n) => n?.trim().toUpperCase()).filter((n): n is string => Boolean(n)));
  let hoechste = KUNDENNUMMER_START - 1;
  for (const n of vorhanden) {
    const treffer = SCHEMA.exec(n);
    if (treffer) hoechste = Math.max(hoechste, Number(treffer[1]));
  }
  let nummer = hoechste + 1;
  let vorschlag = format(nummer);
  // Sicherheitsnetz: nie eine Nummer vorschlagen, die es schon gibt (auch nicht in anderer Schreibweise)
  while (vorhanden.has(vorschlag) || vorhanden.has(vorschlag.replace("-", ""))) {
    nummer++;
    vorschlag = format(nummer);
  }
  return vorschlag;
}
