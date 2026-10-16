// Vorschlag für die nächste Kundennummer (auch im Browser nutzbar).
//
// Regel (Mika, 16.10.2026): Schema wie zuletzt in Plancraft: „KD-“ + Jahr (2 Ziffern) + laufende
// 4-stellige Nummer, z. B. KD-261351. Die laufende Nummer zählt über die Jahre ohne Neustart weiter
// (höchste vorhandene + 1). Nummern werden nie wiederverwendet: Es zählen ALLE Kontakte, auch archivierte.
//
// Hinweis zur „Regelkonformität“: Gesetzlich vorgeschrieben ist eine lückenlose, eindeutige Nummer
// nur bei Rechnungen (§ 14 UStG, GoBD). Die vergibt Lexware, nicht diese Funktion. Eine Kundennummer
// muss nur eindeutig sein.

/** Erkennt „KD-241350“ und „KD231125“ (mit oder ohne Bindestrich). */
const SCHEMA = /^KD-?(\d{2})(\d{4})$/i;

export const KUNDENNUMMER_BEISPIEL = "KD-261351";

export function naechsteKundennummer(bestehende: readonly (string | null | undefined)[], jahr: number): string {
  const vorhanden = new Set(bestehende.map((n) => n?.trim().toUpperCase()).filter((n): n is string => Boolean(n)));
  let hoechste = 0;
  for (const n of vorhanden) {
    const treffer = SCHEMA.exec(n);
    if (treffer) hoechste = Math.max(hoechste, Number(treffer[2]));
  }
  const yy = String(jahr % 100).padStart(2, "0");
  let nummer = hoechste + 1;
  let vorschlag = `KD-${yy}${String(nummer).padStart(4, "0")}`;
  // Sicherheitsnetz: nie eine Nummer vorschlagen, die es schon gibt (auch nicht in anderer Schreibweise)
  while (vorhanden.has(vorschlag) || vorhanden.has(vorschlag.replace("-", ""))) {
    nummer++;
    vorschlag = `KD-${yy}${String(nummer).padStart(4, "0")}`;
  }
  return vorschlag;
}
