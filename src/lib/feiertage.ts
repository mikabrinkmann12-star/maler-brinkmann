// Gesetzliche Feiertage in Niedersachsen (auch im Browser nutzbar).
// Berechnet, nicht gespeichert: Die beweglichen Feiertage hängen vom Ostersonntag ab.
// Niedersachsen: Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt,
// Pfingstmontag, Tag der Deutschen Einheit, Reformationstag (seit 2018), 1. und 2. Weihnachtstag.

import { tageVerschieben } from "@/lib/datum";

/** Ostersonntag als „JJJJ-MM-TT“ (Gaußsche Osterformel, gültig für den gregorianischen Kalender). */
export function ostersonntag(jahr: number): string {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

const speicher = new Map<number, Map<string, string>>();

/** Alle Feiertage eines Jahres: Datum → Name. */
export function feiertageImJahr(jahr: number): Map<string, string> {
  const vorhanden = speicher.get(jahr);
  if (vorhanden) return vorhanden;
  const ostern = ostersonntag(jahr);
  const liste: [string, string][] = [
    [`${jahr}-01-01`, "Neujahr"],
    [tageVerschieben(ostern, -2), "Karfreitag"],
    [tageVerschieben(ostern, 1), "Ostermontag"],
    [`${jahr}-05-01`, "Tag der Arbeit"],
    [tageVerschieben(ostern, 39), "Christi Himmelfahrt"],
    [tageVerschieben(ostern, 50), "Pfingstmontag"],
    [`${jahr}-10-03`, "Tag der Deutschen Einheit"],
    [`${jahr}-10-31`, "Reformationstag"],
    [`${jahr}-12-25`, "1. Weihnachtstag"],
    [`${jahr}-12-26`, "2. Weihnachtstag"],
  ];
  const ergebnis = new Map(liste);
  speicher.set(jahr, ergebnis);
  return ergebnis;
}

/** Name des Feiertags oder null, wenn der Tag keiner ist. */
export function feiertagName(datum: string): string | null {
  return feiertageImJahr(Number(datum.slice(0, 4))).get(datum) ?? null;
}
