// Zeiträume für Filter („Datum“, „Zeitraum“): Vorgaben wie in Plancraft und ein Monatsraster mit Kalenderwochen.
// Alle Daten sind ISO-Tage („JJJJ-MM-TT“) in Berliner Zeit (auch im Browser nutzbar).
import { tageVerschieben } from "@/lib/datum";

export const ZEITRAUM_VORGABEN = [
  ["heute", "Heute"],
  ["gestern", "Gestern"],
  ["diese_woche", "Diese Woche"],
  ["letzte_woche", "Letzte Woche"],
  ["letzte_7_tage", "Letzte 7 Tage"],
  ["letzte_30_tage", "Letzte 30 Tage"],
  ["dieser_monat", "Dieser Monat"],
  ["letzter_monat", "Letzter Monat"],
  ["dieses_quartal", "Dieses Quartal"],
  ["letztes_quartal", "Letztes Quartal"],
  ["dieses_jahr", "Dieses Jahr"],
  ["letztes_jahr", "Letztes Jahr"],
] as const;
export type ZeitraumVorgabe = (typeof ZEITRAUM_VORGABEN)[number][0];

export type Zeitraum = { von: string; bis: string };

const teile = (iso: string) => ({ j: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), t: Number(iso.slice(8, 10)) });
const iso = (j: number, m: number, t: number) => `${String(j).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(t).padStart(2, "0")}`;

/** Wochentag: 0 = Montag … 6 = Sonntag. */
export function wochentag(tag: string): number {
  const d = new Date(`${tag}T12:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

export function letzterTagDesMonats(j: number, m: number): number {
  return new Date(Date.UTC(j, m, 0)).getUTCDate();
}

/** Der Bereich einer Vorgabe, bezogen auf „heute“. Wochen laufen von Montag bis Sonntag. */
export function vorgabeBereich(vorgabe: ZeitraumVorgabe, heute: string): Zeitraum {
  const { j, m } = teile(heute);
  const montag = tageVerschieben(heute, -wochentag(heute));
  switch (vorgabe) {
    case "heute":
      return { von: heute, bis: heute };
    case "gestern": {
      const g = tageVerschieben(heute, -1);
      return { von: g, bis: g };
    }
    case "diese_woche":
      return { von: montag, bis: tageVerschieben(montag, 6) };
    case "letzte_woche":
      return { von: tageVerschieben(montag, -7), bis: tageVerschieben(montag, -1) };
    case "letzte_7_tage":
      return { von: tageVerschieben(heute, -6), bis: heute };
    case "letzte_30_tage":
      return { von: tageVerschieben(heute, -29), bis: heute };
    case "dieser_monat":
      return { von: iso(j, m, 1), bis: iso(j, m, letzterTagDesMonats(j, m)) };
    case "letzter_monat": {
      const lj = m === 1 ? j - 1 : j;
      const lm = m === 1 ? 12 : m - 1;
      return { von: iso(lj, lm, 1), bis: iso(lj, lm, letzterTagDesMonats(lj, lm)) };
    }
    case "dieses_quartal": {
      const q0 = Math.floor((m - 1) / 3) * 3 + 1;
      return { von: iso(j, q0, 1), bis: iso(j, q0 + 2, letzterTagDesMonats(j, q0 + 2)) };
    }
    case "letztes_quartal": {
      let q0 = Math.floor((m - 1) / 3) * 3 + 1 - 3;
      let qj = j;
      if (q0 < 1) {
        q0 += 12;
        qj -= 1;
      }
      return { von: iso(qj, q0, 1), bis: iso(qj, q0 + 2, letzterTagDesMonats(qj, q0 + 2)) };
    }
    case "dieses_jahr":
      return { von: iso(j, 1, 1), bis: iso(j, 12, 31) };
    case "letztes_jahr":
      return { von: iso(j - 1, 1, 1), bis: iso(j - 1, 12, 31) };
  }
}

/** Kalenderwoche nach ISO 8601. */
export function isoKalenderwoche(tag: string): number {
  const d = new Date(`${tag}T12:00:00Z`);
  const wt = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wt + 3); // Donnerstag der Woche
  const ersterDonnerstag = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const wt1 = (ersterDonnerstag.getUTCDay() + 6) % 7;
  ersterDonnerstag.setUTCDate(ersterDonnerstag.getUTCDate() - wt1 + 3);
  return 1 + Math.round((d.getTime() - ersterDonnerstag.getTime()) / (7 * 24 * 3600 * 1000));
}

export type MonatsWoche = { kw: number; tage: (string | null)[] };

/** Monatsraster: Zeilen = Wochen (Mo–So) mit Kalenderwoche; Tage außerhalb des Monats sind null. */
export function monatsRaster(jahr: number, monat: number): MonatsWoche[] {
  const letzter = letzterTagDesMonats(jahr, monat);
  const wochen: MonatsWoche[] = [];
  let zeile: (string | null)[] = Array(wochentag(iso(jahr, monat, 1))).fill(null);
  for (let t = 1; t <= letzter; t++) {
    zeile.push(iso(jahr, monat, t));
    if (zeile.length === 7) {
      wochen.push({ kw: isoKalenderwoche(zeile.find(Boolean)!), tage: zeile });
      zeile = [];
    }
  }
  if (zeile.length) {
    const kw = isoKalenderwoche(zeile.find(Boolean)!);
    while (zeile.length < 7) zeile.push(null);
    wochen.push({ kw, tage: zeile });
  }
  return wochen;
}

/** Monat vor/zurück: „2026-10“ + 1 → „2026-11“. */
export function monatVerschieben(jahr: number, monat: number, n: number): { jahr: number; monat: number } {
  const gesamt = jahr * 12 + (monat - 1) + n;
  return { jahr: Math.floor(gesamt / 12), monat: (gesamt % 12) + 1 };
}

export function istTag(wert: unknown): wert is string {
  return typeof wert === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wert) && !Number.isNaN(Date.parse(`${wert}T12:00:00Z`));
}

/** Passt der Bereich zu einer Vorgabe? Dann steht in der Filterleiste deren Name, sonst „von – bis“. */
export function vorgabeFuer(z: Zeitraum, heute: string): ZeitraumVorgabe | null {
  for (const [name] of ZEITRAUM_VORGABEN) {
    const b = vorgabeBereich(name, heute);
    if (b.von === z.von && b.bis === z.bis) return name;
  }
  return null;
}
