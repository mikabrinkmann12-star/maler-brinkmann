// Aufmaß-Summen als Auswahl für Positionen in Angebot und Rechnung (auch im Browser nutzbar).

import { aufmassSummen, type AufmassEinheit } from "@/lib/aufmass";
import { suchtext } from "@/lib/suche";

export type AufmassAuswahl = {
  position: string;
  /** Menge, höchstens 3 Nachkommastellen */
  menge: number;
  /** Einheit, wie sie in Positionen steht (m², m, Stk) */
  einheit: string;
};

/** Einheit des Aufmaßes → Einheit einer Position. */
export function einheitFuerPosition(e: AufmassEinheit): string {
  return e === "m2" ? "m²" : e === "m" ? "m" : "Stk";
}

/** Summen je Position und Einheit aus den Aufmaß-Zeilen, bereit zur Auswahl. */
export function aufmassAuswahl(zeilen: { position: string; einheit: AufmassEinheit; menge: number }[]): AufmassAuswahl[] {
  return aufmassSummen(zeilen).map((s) => ({ position: s.position, menge: s.menge, einheit: einheitFuerPosition(s.einheit) }));
}

const norm = (t: string) => suchtext(t).toLowerCase();

/**
 * Passende Einträge nach oben: Der Name des Aufmaß-Eintrags kommt im Text der Position vor (oder umgekehrt), z. B. Position
 * „Wände streichen, zweimal“ und Aufmaß „Wände streichen“. Die übrige Reihenfolge bleibt erhalten.
 */
export function aufmassSortiert(liste: AufmassAuswahl[], positionsText: string): { eintrag: AufmassAuswahl; passt: boolean }[] {
  const text = norm(positionsText);
  const bewertet = liste.map((eintrag, i) => {
    const name = norm(eintrag.position);
    const passt = text.length > 0 && name.length > 0 && (text.includes(name) || name.includes(text));
    return { eintrag, passt, i };
  });
  return bewertet.sort((a, b) => Number(b.passt) - Number(a.passt) || a.i - b.i).map(({ eintrag, passt }) => ({ eintrag, passt }));
}
