// Arbeitsanweisung aus einem Angebot (auch im Browser nutzbar).
// Es entsteht eine Anweisung in Stichpunkten OHNE Preise: nur Arbeit, Mengen und Einheiten.
// Das Format ist einfacher Text, damit das Büro ihn vor der Freigabe ändern kann:
//   # Überschrift          (ein Titel des Angebots)
//   - Stichpunkt           (eine Position, mit Menge)
//     - Unterpunkt         (ein Satz aus dem Langtext)
//   beliebige andere Zeile = Absatz
// Die Erzeugung ist regelbasiert (keine KI, keine Kosten); eine KI kann später dieselbe Funktion ersetzen.

import type { BerechneteZeile } from "@/lib/angebot";
import { formatZahl } from "@/lib/format";

export type AnweisungBlock =
  | { art: "ueberschrift"; text: string }
  | { art: "punkt"; text: string }
  | { art: "unterpunkt"; text: string }
  | { art: "absatz"; text: string }
  | { art: "leer" };

export const MAX_ANWEISUNG = 20000;
const MAX_UNTERPUNKT = 200;

/** „313,63 m²“; Pauschalen als „pauschal“ */
export function mengeText(menge: number, einheit: string): string {
  const e = einheit.trim();
  if (/^(psch\.?|pauschal|pausch\.?)$/i.test(e)) return "pauschal";
  return `${formatZahl(menge, { min: 0, max: 3 })} ${e}`.trim();
}

/** Langtext in einzelne Sätze/Zeilen für Unterpunkte zerlegen. */
export function saetze(langtext: string): string[] {
  const aus: string[] = [];
  for (const zeile of langtext.replace(/\r/g, "").split("\n")) {
    // Satzende: Punkt + Leerzeichen + Großbuchstabe/Ziffer (nicht bei Abkürzungen wie „z. B.“ oder Zahlen wie „3. Etage“)
    for (const teil of zeile.split(/(?<=[a-zäöüß]{3,}[.!])\s+(?=[A-ZÄÖÜ0-9])/)) {
      const text = teil.trim().replace(/^[-•*]\s*/, "").replace(/[.]$/, "").trim();
      if (!text) continue;
      aus.push(text.length > MAX_UNTERPUNKT ? `${text.slice(0, MAX_UNTERPUNKT - 1).trimEnd()}…` : text);
    }
  }
  return aus;
}

export function arbeitsanweisungErzeugen(angebot: { betreff: string; adresse: string; zeilen: BerechneteZeile[] }): { titel: string; inhalt: string } {
  const zeilen: string[] = [];
  if (angebot.adresse.trim()) zeilen.push(`Baustelle: ${angebot.adresse.trim()}`, "");

  for (const z of angebot.zeilen) {
    const b = z.baustein;
    if (b.typ === "titel") {
      if (zeilen.length && zeilen[zeilen.length - 1] !== "") zeilen.push("");
      zeilen.push(`# ${b.kurztext.trim()}`);
    } else if (b.typ === "position") {
      if ((b.menge ?? 0) <= 0) continue; // Abzüge und Nullpositionen sind keine Arbeit
      const kopf = b.kurztext.trim() || saetze(b.langtext)[0] || "Position";
      zeilen.push(`- ${kopf} – ${mengeText(b.menge ?? 0, b.einheit)}`);
      const rest = b.kurztext.trim() ? saetze(b.langtext) : saetze(b.langtext).slice(1);
      for (const s of rest) zeilen.push(`  - ${s}`);
    } else if (b.typ === "text") {
      for (const s of b.langtext.replace(/\r/g, "").split("\n")) {
        if (s.trim()) zeilen.push(`Hinweis: ${s.trim()}`);
      }
    }
  }
  while (zeilen.length && zeilen[zeilen.length - 1] === "") zeilen.pop();
  return { titel: `Arbeitsanweisung: ${angebot.betreff}`.slice(0, 200), inhalt: zeilen.join("\n").slice(0, MAX_ANWEISUNG) };
}

/** Text der Arbeitsanweisung in Blöcke zum Anzeigen zerlegen. */
export function anweisungBlocks(inhalt: string): AnweisungBlock[] {
  return inhalt.replace(/\r/g, "").split("\n").map((zeile): AnweisungBlock => {
    if (zeile.trim() === "") return { art: "leer" };
    if (/^#\s+/.test(zeile)) return { art: "ueberschrift", text: zeile.replace(/^#\s+/, "").trim() };
    if (/^\s{2,}-\s+/.test(zeile)) return { art: "unterpunkt", text: zeile.replace(/^\s+-\s+/, "").trim() };
    if (/^-\s+/.test(zeile)) return { art: "punkt", text: zeile.replace(/^-\s+/, "").trim() };
    return { art: "absatz", text: zeile.trim() };
  });
}

// ---------------------------------------------------------------------------
// Materialliste (Mika, 18.10.2026): die Material-Positionen eines Angebots, ohne Preise
// ---------------------------------------------------------------------------

export const MATERIALLISTE_LEER = "Noch kein Material. Zeilen mit „- “ eintragen, zum Beispiel: - Dispersionsfarbe weiß – 2 Eimer";

/**
 * Materialliste aus einem Angebot: Positionen, die aus dem Material-Katalog stammen, als Stichpunkte „Bezeichnung – Menge Einheit“.
 * Preise fehlen. Eigene Zeilen ergänzt das Büro von Hand (der Text ist vor der Freigabe änderbar).
 */
export function materiallisteErzeugen(angebot: { betreff: string; adresse: string; zeilen: BerechneteZeile[] }): { titel: string; inhalt: string; anzahl: number } {
  const zeilen: string[] = [];
  if (angebot.adresse.trim()) zeilen.push(`Baustelle: ${angebot.adresse.trim()}`, "");
  zeilen.push("# Material");
  let anzahl = 0;
  for (const z of angebot.zeilen) {
    const b = z.baustein;
    if (b.typ !== "position" || !b.materialId) continue;
    if ((b.menge ?? 0) <= 0) continue;
    const name = b.kurztext.trim() || saetze(b.langtext)[0] || "Material";
    zeilen.push(`- ${name} – ${mengeText(b.menge ?? 0, b.einheit)}`);
    anzahl += 1;
  }
  if (anzahl === 0) zeilen.push(MATERIALLISTE_LEER);
  return { titel: `Materialliste: ${angebot.betreff}`.slice(0, 200), inhalt: zeilen.join("\n").slice(0, MAX_ANWEISUNG), anzahl };
}
