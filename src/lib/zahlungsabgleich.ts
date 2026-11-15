// Kontoumsätze offenen Rechnungen zuordnen (reine Logik, testbar). Abbuchungen → offene Eingangsrechnungen, Geldeingänge → offene
// eigene Rechnungen (auch mit Skonto) und Gutschriften von Lieferanten. Die App macht nur VORSCHLÄGE; bezahlt wird erst nach Bestätigung.
import type { Umsatz } from "@/lib/kontoauszug";

export type OffeneEingang = { id: string; lieferant: string; rechnungsnummer: string; rechnungsdatum: string | null; brutto: number | null; iban: string; gutschrift: boolean };
export type OffeneAusgang = {
  id: string;
  rechnungsnummer: string;
  kunde: string;
  rechnungsdatum: string;
  /** Zahlbetrag brutto (nach Abzug der Abschläge) */
  brutto: number;
  skontoProzent: number | null;
  skontoTage: number | null;
};

export type Vorschlag = {
  umsatz: number;
  art: "eingang" | "ausgang";
  id: string;
  titel: string;
  betrag: number;
  datum: string;
  punkte: number;
  gruende: string[];
};

const klein = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const gleich = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** Steht die Rechnungsnummer im Verwendungszweck? (ohne Leer- und Sonderzeichen, mindestens 3 Zeichen) */
export function nummerImZweck(nummer: string, zweck: string): boolean {
  const n = klein(nummer);
  return n.length >= 3 && klein(zweck).includes(n);
}

/** Erstes Wort mit mindestens 4 Buchstaben (z. B. „Farben“ aus „Farben Müller GmbH“), sonst leer. */
function namensKern(name: string): string {
  const w = name.toLowerCase().split(/[^a-zäöüß0-9]+/).find((x) => x.length >= 4 && !["gmbh", "kg", "ohg", "firma", "herr", "frau"].includes(x));
  return w ?? "";
}

function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / 86_400_000);
}

/**
 * Bewertet alle Paare und vergibt jede Rechnung und jeden Umsatz höchstens einmal (beste Punkte zuerst).
 * Pflicht: Betrag passt. Punkte: Rechnungsnummer im Zweck +5, IBAN gleich +3, Name passt +2, Zahlung nach dem Rechnungsdatum +1.
 * Ohne Nummer, IBAN oder Name (nur Betrag) gibt es keinen Vorschlag, damit nichts Falsches als bezahlt markiert wird.
 */
export function zahlungenZuordnen(umsaetze: Umsatz[], eingang: OffeneEingang[], ausgang: OffeneAusgang[]): Vorschlag[] {
  const kandidaten: Vorschlag[] = [];
  umsaetze.forEach((u, ui) => {
    const zweckUndName = `${u.zweck} ${u.name}`;
    // Abbuchung → Eingangsrechnung; Geldeingang → Gutschrift eines Lieferanten
    for (const r of eingang) {
      if (r.brutto === null || (u.betrag < 0) === r.gutschrift || !gleich(Math.abs(u.betrag), Math.abs(r.brutto))) continue;
      const gruende: string[] = [];
      let punkte = 0;
      if (r.rechnungsnummer && nummerImZweck(r.rechnungsnummer, u.zweck)) { punkte += 5; gruende.push("Rechnungsnummer im Verwendungszweck"); }
      if (r.iban && u.iban && r.iban === u.iban) { punkte += 3; gruende.push("IBAN passt"); }
      const kern = namensKern(r.lieferant);
      if (kern && zweckUndName.toLowerCase().includes(kern)) { punkte += 2; gruende.push("Name passt"); }
      if (punkte === 0) continue;
      if (!r.rechnungsdatum || u.datum >= r.rechnungsdatum) punkte += 1;
      kandidaten.push({ umsatz: ui, art: "eingang", id: r.id, titel: `${r.gutschrift ? "Gutschrift" : "Eingangsrechnung"} ${r.lieferant}${r.rechnungsnummer ? ` · ${r.rechnungsnummer}` : ""}`, betrag: u.betrag, datum: u.datum, punkte, gruende: ["Betrag passt", ...gruende] });
    }
    // Geldeingang → eigene Rechnung (voll oder mit Skonto innerhalb der Frist)
    if (u.betrag > 0) {
      for (const r of ausgang) {
        const voll = gleich(u.betrag, r.brutto);
        const mitSkonto =
          !voll && r.skontoProzent && r.skontoTage !== null && tageZwischen(r.rechnungsdatum, u.datum) <= r.skontoTage + 3
          && gleich(u.betrag, Math.round(r.brutto * (1 - r.skontoProzent / 100) * 100) / 100);
        if (!voll && !mitSkonto) continue;
        const gruende: string[] = [voll ? "Betrag passt" : `Betrag passt mit ${String(r.skontoProzent).replace(".", ",")} % Skonto`];
        let punkte = 0;
        if (nummerImZweck(r.rechnungsnummer, u.zweck)) { punkte += 5; gruende.push("Rechnungsnummer im Verwendungszweck"); }
        const kern = namensKern(r.kunde);
        if (kern && zweckUndName.toLowerCase().includes(kern)) { punkte += 2; gruende.push("Name passt"); }
        if (punkte === 0) continue;
        if (u.datum >= r.rechnungsdatum) punkte += 1;
        kandidaten.push({ umsatz: ui, art: "ausgang", id: r.id, titel: `Rechnung ${r.rechnungsnummer} · ${r.kunde}`, betrag: u.betrag, datum: u.datum, punkte, gruende });
      }
    }
  });
  kandidaten.sort((a, b) => b.punkte - a.punkte || a.umsatz - b.umsatz);
  const umsatzVergeben = new Set<number>();
  const rechnungVergeben = new Set<string>();
  const ergebnis: Vorschlag[] = [];
  for (const k of kandidaten) {
    if (umsatzVergeben.has(k.umsatz) || rechnungVergeben.has(k.id)) continue;
    umsatzVergeben.add(k.umsatz);
    rechnungVergeben.add(k.id);
    ergebnis.push(k);
  }
  return ergebnis.sort((a, b) => a.datum.localeCompare(b.datum));
}
