// Nachkalkulation eines Projekts wie in Plancraft: Soll (aus dem Angebot und der Kalkulation der Leistungen) gegen Ist (Arbeitszeiten,
// erfasste Kosten, zugewiesene Eingangsrechnungen) je Kostenart. Reine Logik ohne Datenbank, getestet.
//
// Annahmen (siehe docs/NACHKALKULATION.md, mit Mika abzustimmen):
//  - Soll-Kosten und Soll-Stunden gibt es nur für Positionen, die aus einer **kalkulierten Leistung** stammen (Preis kalkulieren im Katalog).
//    Andere Positionen zählen nur zum Erlös.
//  - Der Ist-Lohn rechnet alle Arbeits-, Fahrt-, Schlechtwetter- und sonstigen Stunden des Projekts mit den Lohnkosten der ersten Lohngruppe
//    (die Lohngruppe je Mitarbeiter gibt es noch nicht).
//  - Alle Beträge netto.

import { KOSTENARTEN, lohngruppeFinden, type Kostenart, type KalkulationEingabe, type KalkulationEinstellungen } from "@/lib/kalkulation";

export type Betraege = Record<Kostenart, number>;

/** Zeitarten, die als Arbeitsstunden auf dem Projekt zählen (Urlaub, Krank usw. haben kein Projekt). */
export const ARBEITS_ZEITARTEN = ["arbeitszeit", "fahrtzeit", "schlechtwetter", "sonstiges"] as const;

const leer = (): Betraege => ({ lohn: 0, material: 0, geraete: 0, fremdleistung: 0, sonstiges: 0 });
const cent = (euro: number) => Math.round(euro * 100) / 100;

export type SollPosition = {
  menge: number;
  /** Zusammensetzung der Leistung (services.kalkulation), null = nicht kalkuliert (Preis von Hand, Material, freie Position) */
  kalkulation: KalkulationEingabe | null;
};

export type Soll = {
  /** Geplante Arbeitsstunden aus den kalkulierten Positionen */
  stunden: number;
  /** Geplante Kosten (Einkauf) je Kostenart */
  kosten: Betraege;
  kostenGesamt: number;
  /** Anzahl Positionen mit und ohne Kalkulation (für den Hinweis „X von Y Positionen kalkuliert“) */
  kalkuliert: number;
  unkalkuliert: number;
};

export function sollBerechnen(positionen: readonly SollPosition[], einst: KalkulationEinstellungen): Soll {
  const kosten = leer();
  let stunden = 0;
  let kalkuliert = 0;
  let unkalkuliert = 0;
  for (const p of positionen) {
    const k = p.kalkulation;
    if (!k || !(p.menge > 0)) {
      unkalkuliert++;
      continue;
    }
    kalkuliert++;
    const g = lohngruppeFinden(einst, k.lohngruppeId);
    const h = (p.menge * k.lohnMinuten) / 60;
    stunden += h;
    kosten.lohn += g ? h * g.lohnkosten : 0;
    kosten.material += p.menge * k.material;
    kosten.geraete += p.menge * k.geraete;
    kosten.fremdleistung += p.menge * k.fremdleistung;
    kosten.sonstiges += p.menge * k.sonstiges;
  }
  for (const a of KOSTENARTEN) kosten[a] = cent(kosten[a]);
  return { stunden: Math.round(stunden * 100) / 100, kosten, kostenGesamt: cent(KOSTENARTEN.reduce((s, a) => s + kosten[a], 0)), kalkuliert, unkalkuliert };
}

export type Ist = {
  stunden: number;
  kosten: Betraege;
  kostenGesamt: number;
  /** Lohnkosten je Stunde, mit denen der Ist-Lohn gerechnet wurde (null = keine Lohngruppe vorhanden) */
  lohnkostenProStunde: number | null;
};

export function istBerechnen(
  eingabe: {
    zeiten: readonly { art: string; stunden: number }[];
    kosten: readonly { kostenart: string; betrag: number }[];
    eingangsrechnungen: readonly { kostenart: string; netto: number }[];
  },
  einst: KalkulationEinstellungen,
): Ist {
  const stunden = eingabe.zeiten.filter((z) => (ARBEITS_ZEITARTEN as readonly string[]).includes(z.art)).reduce((s, z) => s + z.stunden, 0);
  const lohnkostenProStunde = lohngruppeFinden(einst, "")?.lohnkosten ?? null;
  const kosten = leer();
  kosten.lohn = lohnkostenProStunde === null ? 0 : stunden * lohnkostenProStunde;
  const art = (a: string): Kostenart => (a === "geraete" || a === "fremdleistung" || a === "sonstiges" ? a : "material");
  for (const k of eingabe.kosten) kosten[art(k.kostenart)] += k.betrag;
  for (const r of eingabe.eingangsrechnungen) kosten[art(r.kostenart)] += r.netto;
  for (const a of KOSTENARTEN) kosten[a] = cent(kosten[a]);
  return { stunden: Math.round(stunden * 100) / 100, kosten, kostenGesamt: cent(KOSTENARTEN.reduce((s, a) => s + kosten[a], 0)), lohnkostenProStunde };
}

/** Ist gegen Soll in Prozent (Ist geteilt durch Soll); null, wenn es kein Soll gibt. */
export function prozentVonSoll(ist: number, soll: number): number | null {
  return soll > 0 ? Math.round((ist / soll) * 1000) / 10 : null;
}

export type Ergebnis = {
  /** Erlös netto laut Angebot (nach Rabatt) */
  erlos: number;
  /** Rohertrag = Erlös minus Ist-Kosten */
  ertrag: number;
  /** Rohertrag in Prozent vom Erlös; null ohne Erlös */
  ertragProzent: number | null;
  /** Rohertrag, wenn alles wie geplant läuft (Erlös minus Soll-Kosten) */
  sollErtrag: number;
};

export function ergebnisBerechnen(erlos: number, soll: Soll, ist: Ist): Ergebnis {
  const ertrag = cent(erlos - ist.kostenGesamt);
  return { erlos: cent(erlos), ertrag, ertragProzent: erlos > 0 ? Math.round((ertrag / erlos) * 1000) / 10 : null, sollErtrag: cent(erlos - soll.kostenGesamt) };
}
