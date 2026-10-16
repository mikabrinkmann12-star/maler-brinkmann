// Soll, Ist und Überstundenkonto (auch im Browser nutzbar).
//
// Regeln (mit Mika am 16.10.2026 festgelegt):
// - Das Soll gilt je Wochentag (Mo–Fr) und Mitarbeiter. Ein leeres Feld heißt: Standard
//   aus den Einstellungen „Zeiterfassung“ (Mo–Do 8:30, Fr 6:00). Sa/So und Feiertage
//   in Niedersachsen haben Soll 0.
// - Arbeitszeit, Fahrtzeit, Schlechtwetter und Sonstiges zählen als gearbeitet.
// - Urlaub und Krank erfüllen das Soll des Tages (kein Minus), mehr gearbeitete
//   Stunden bleiben aber Plus.
// - Unbezahlter Urlaub und Kurzarbeit nehmen das Soll des Tages weg (neutral).
// - Ein Tag ohne jeden Eintrag zählt mit dem vollen Soll als Minus.
// - „Abfeiern“ braucht keine eigene Regel: Der Tag hat Soll und keine Arbeitszeit,
//   das Konto sinkt von selbst.
// - Gerechnet wird ab dem Tag „Konto ab“ bis einschließlich gestern (heute ist noch nicht vorbei).

import { monatsGrenzen, tageVerschieben } from "@/lib/datum";
import { feiertagName } from "@/lib/feiertage";
import { arbeitsMinuten, stundenAusMinuten, type TagesStandard, type ZeitArt } from "@/lib/zeiten";

/** Soll in Stunden für Montag bis Freitag. */
export type SollWoche = [number, number, number, number, number];
/** Gespeichertes Soll: null = Standard. */
export type SollEinstellung = [number | null, number | null, number | null, number | null, number | null];

export const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr"] as const;

const ALS_GEARBEITET: readonly ZeitArt[] = ["arbeitszeit", "fahrtzeit", "schlechtwetter", "sonstiges"];
const ERSETZT_SOLL: readonly ZeitArt[] = ["urlaub", "krank"];
const SOLL_FAELLT_WEG: readonly ZeitArt[] = ["unbezahlter_urlaub", "kurzarbeit"];

/**
 * Stunden-Eingabe mit optionalem Vorzeichen lesen: „12,5“, „-3:30“, „+2“ → Zahl.
 * Unlesbar → null. (Ohne Vorzeichen siehe stundenEingabeLesen in zeit-schema.ts.)
 */
export function saldoLesen(text: string): number | null {
  const t = text.trim().replace(/\s*(std\.?|h)$/i, "");
  const m = /^([+\-−]?)\s*(\d{1,3})(?:([.,])(\d{1,2})|:([0-5]\d))?$/.exec(t);
  if (!m) return null;
  const betrag = m[5] !== undefined ? Number(m[2]) + Number(m[5]) / 60 : Number(`${m[2]}.${m[4] ?? "0"}`);
  const wert = Math.round(betrag * 100) / 100;
  return m[1] === "-" || m[1] === "−" ? -wert : wert;
}

/** Wochentag eines Datums: 0 = Montag … 6 = Sonntag. */
export function wochentag(datum: string): number {
  return (new Date(`${datum}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function runde(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Standard-Soll aus den Einstellungen: Mo–Do Standardzeit, Freitag die kürzere Zeit. */
export function standardSoll(
  e: TagesStandard & { freitagEnde: string; freitagPauseMin: number },
): SollWoche {
  const stunden = (ende: string, pause: number) => {
    const r = arbeitsMinuten(e.standardBeginn, ende, pause);
    return "minuten" in r ? stundenAusMinuten(r.minuten) : 0;
  };
  const moDo = stunden(e.standardEnde, e.standardPauseMin);
  return [moDo, moDo, moDo, moDo, stunden(e.freitagEnde, e.freitagPauseMin)];
}

/** Gespeichertes Soll der Person mit dem Standard auffüllen. */
export function sollAufloesen(einstellung: SollEinstellung, standard: SollWoche): SollWoche {
  return standard.map((s, i) => einstellung[i] ?? s) as SollWoche;
}

/** Soll eines Tages in Stunden (Wochenende und Feiertage: 0). */
export function tagesSoll(datum: string, soll: SollWoche): number {
  const tag = wochentag(datum);
  if (tag > 4 || feiertagName(datum)) return 0;
  return soll[tag];
}

export type KontoEintrag = { datum: string; art: ZeitArt; stunden: number };
export type Bilanz = { soll: number; ist: number; differenz: number };

/** Soll, Ist und Differenz eines einzelnen Tages. */
export function tagesBilanz(sollTag: number, eintraege: { art: ZeitArt; stunden: number }[]): Bilanz {
  const gearbeitet = eintraege.filter((e) => ALS_GEARBEITET.includes(e.art)).reduce((s, e) => s + e.stunden, 0);
  const ersetzt = eintraege.some((e) => ERSETZT_SOLL.includes(e.art));
  const entfaellt = eintraege.some((e) => SOLL_FAELLT_WEG.includes(e.art));
  const soll = entfaellt ? 0 : sollTag;
  const ist = ersetzt ? Math.max(gearbeitet, soll) : gearbeitet;
  return { soll: runde(soll), ist: runde(ist), differenz: runde(ist - soll) };
}

/** Summe über alle Tage von `ab` bis `bis` (beide inklusive). Ist `ab` nach `bis`, ist alles 0. */
export function periodenBilanz(ab: string, bis: string, soll: SollWoche, eintraege: KontoEintrag[]): Bilanz {
  const nachTag = new Map<string, KontoEintrag[]>();
  for (const e of eintraege) {
    if (e.datum < ab || e.datum > bis) continue;
    const liste = nachTag.get(e.datum) ?? [];
    liste.push(e);
    nachTag.set(e.datum, liste);
  }

  let summe: Bilanz = { soll: 0, ist: 0, differenz: 0 };
  for (let tag = ab; tag <= bis; tag = tageVerschieben(tag, 1)) {
    const b = tagesBilanz(tagesSoll(tag, soll), nachTag.get(tag) ?? []);
    summe = { soll: runde(summe.soll + b.soll), ist: runde(summe.ist + b.ist), differenz: runde(summe.differenz + b.differenz) };
  }
  return summe;
}

export type KontoEingabe = {
  /** Erster Tag, der zählt. Leer = Konto wird für diese Person nicht geführt. */
  kontoAb: string | null;
  anfangssaldo: number;
  soll: SollWoche;
  eintraege: KontoEintrag[];
  /** Heute (Europe/Berlin) – gerechnet wird bis gestern. */
  heute: string;
};

export type KontoErgebnis = {
  /** Stand des Überstundenkontos bis gestern (Anfangssaldo + alle Differenzen). */
  stand: number;
  /** Bilanz des gewählten Monats (nur Tage ab „Konto ab“ und bis gestern). */
  monat: Bilanz;
};

/** Stand des Kontos und Bilanz eines Monats. Ohne `kontoAb` gibt es kein Konto (null). */
export function kontoBerechnen(e: KontoEingabe, monat: string): KontoErgebnis | null {
  if (!e.kontoAb) return null;
  const gestern = tageVerschieben(e.heute, -1);
  const gesamt = periodenBilanz(e.kontoAb, gestern, e.soll, e.eintraege);
  const { erster, letzter } = monatsGrenzen(monat);
  const monatsAb = e.kontoAb > erster ? e.kontoAb : erster;
  const monatsBis = gestern < letzter ? gestern : letzter;
  return {
    stand: runde(e.anfangssaldo + gesamt.differenz),
    monat: periodenBilanz(monatsAb, monatsBis, e.soll, e.eintraege),
  };
}

// ---------------------------------------------------------------------------
// Abfeiern: reicht das Konto?
// ---------------------------------------------------------------------------

/** Soll-Stunden aller Tage von `von` bis `bis` (beide inklusive), ohne Wochenenden und Feiertage. */
export function sollSumme(von: string, bis: string, soll: SollWoche): number {
  let summe = 0;
  for (let tag = von; tag <= bis; tag = tageVerschieben(tag, 1)) summe = runde(summe + tagesSoll(tag, soll));
  return summe;
}

export type AbbauPruefung = {
  ok: boolean;
  /** Stunden, die der neue Antrag ab heute braucht */
  benoetigt: number;
  /** Stunden, die schon durch andere offene/genehmigte Abfeier-Anträge ab heute vorgemerkt sind */
  reserviert: number;
  /** Konto-Stand nach allen Anträgen (kann negativ sein) */
  nachher: number;
};

/**
 * Darf dieser Abfeier-Antrag gestellt werden? Nur, wenn das Konto danach nicht negativ wird.
 * Tage vor heute stecken schon im Konto-Stand (dort fehlte die Arbeitszeit), sie zählen
 * hier nicht noch einmal. Andere offene oder genehmigte Anträge ab heute sind vorgemerkt.
 */
export function abbauPruefen(opts: {
  stand: number;
  soll: SollWoche;
  heute: string;
  neu: { von: string; bis: string };
  vorgemerkt: { von: string; bis: string }[];
}): AbbauPruefung {
  const ab = (von: string) => (von > opts.heute ? von : opts.heute);
  const benoetigt = sollSumme(ab(opts.neu.von), opts.neu.bis, opts.soll);
  const reserviert = opts.vorgemerkt.reduce((s, a) => runde(s + sollSumme(ab(a.von), a.bis, opts.soll)), 0);
  const nachher = runde(opts.stand - reserviert - benoetigt);
  return { ok: nachher >= 0, benoetigt, reserviert, nachher };
}
