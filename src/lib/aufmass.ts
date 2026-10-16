// Aufmaß-Berechnung (auch im Browser nutzbar). Die Menge rechnet IMMER diese
// Datei – im Browser zur Anzeige, auf dem Server verbindlich vor dem Speichern.
//
// Regel (mit Mika geklärt, VOB/C DIN 18363): Öffnungen wie Fenster und Türen
// bis 2,5 m² Einzelgröße werden übermessen, also NICHT abgezogen. Größere
// Öffnungen werden abgezogen.
// Annahme (noch von Mika zu bestätigen, siehe CLAUDE.md „Offene Fragen“):
// Abzüge gelten für die ganze Zeile, sie werden nicht mit deren Anzahl multipliziert.

export type AufmassEinheit = "m2" | "m" | "stk";

export const AUFMASS_EINHEITEN = ["m2", "m", "stk"] as const satisfies readonly AufmassEinheit[];
export const EINHEIT_NAMEN: Record<AufmassEinheit, string> = { m2: "m²", m: "m", stk: "Stück" };

/** Bis zu dieser Einzelgröße (m²) wird eine Öffnung übermessen. */
export const UEBERMESSEN_BIS_M2 = 2.5;

export type Abzug = { bezeichnung: string; breite: number; hoehe: number; anzahl: number };
export type AufmassEingabe = {
  einheit: AufmassEinheit;
  laenge: number | null;
  hoehe: number | null;
  anzahl: number;
  abzuege: Abzug[];
};

export type AbzugErgebnis = Abzug & {
  /** Fläche EINER Öffnung in m² */
  einzelflaeche: number;
  uebermessen: boolean;
  /** Was tatsächlich abgezogen wird (0 bei übermessen) */
  abgezogen: number;
};

export type AufmassErgebnis = {
  brutto: number;
  abzug: number;
  menge: number;
  abzuege: AbzugErgebnis[];
};

/** Runden auf n Nachkommastellen ohne Gleitkomma-Ausreißer (2,675 → 2,68). */
export function runden(wert: number, stellen = 3): number {
  const faktor = 10 ** stellen;
  return Math.round((wert + Number.EPSILON) * faktor) / faktor;
}

export function abzugBewerten(a: Abzug): AbzugErgebnis {
  const einzelflaeche = runden(a.breite * a.hoehe);
  const uebermessen = einzelflaeche <= UEBERMESSEN_BIS_M2;
  return { ...a, einzelflaeche, uebermessen, abgezogen: uebermessen ? 0 : runden(einzelflaeche * a.anzahl) };
}

export function aufmassBerechnen(e: AufmassEingabe): AufmassErgebnis {
  const laenge = e.laenge ?? 0;
  if (e.einheit === "stk") return { brutto: runden(e.anzahl), abzug: 0, menge: runden(e.anzahl), abzuege: [] };
  if (e.einheit === "m") {
    const menge = runden(laenge * e.anzahl);
    return { brutto: menge, abzug: 0, menge, abzuege: [] };
  }
  const brutto = runden(laenge * (e.hoehe ?? 0) * e.anzahl);
  const abzuege = e.abzuege.map(abzugBewerten);
  const abzug = runden(abzuege.reduce((s, a) => s + a.abgezogen, 0));
  return { brutto, abzug, menge: runden(Math.max(0, brutto - abzug)), abzuege };
}

/** Summen je Position und Einheit, z. B. „Wände streichen“ → 123,4 m². */
export function aufmassSummen(
  zeilen: { position: string; einheit: AufmassEinheit; menge: number }[],
): { position: string; einheit: AufmassEinheit; menge: number }[] {
  const summen = new Map<string, { position: string; einheit: AufmassEinheit; menge: number }>();
  for (const z of zeilen) {
    const schluessel = `${z.position.trim().toLowerCase()}|${z.einheit}`;
    const alt = summen.get(schluessel);
    if (alt) alt.menge = runden(alt.menge + z.menge);
    else summen.set(schluessel, { position: z.position.trim(), einheit: z.einheit, menge: runden(z.menge) });
  }
  return [...summen.values()].sort((a, b) => a.position.localeCompare(b.position, "de"));
}

/** Deutsche Zahl lesen: „4,20“, „4.2“ oder „4“ → 4.2. Leer/unlesbar → null. */
export function zahlLesen(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  if (!/^\d{1,6}([.,]\d{1,3})?$/.test(t)) return null;
  return Number(t.replace(",", "."));
}
