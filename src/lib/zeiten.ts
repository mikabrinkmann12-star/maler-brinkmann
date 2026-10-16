// Regeln und Rechnungen rund um die Zeiterfassung (auch im Browser nutzbar).
// Verbindlich prüft immer die Datenbank (RLS + Trigger). Diese Funktionen
// spiegeln die Regeln, damit die App vorher verständliche Hinweise zeigt.

import type { Database } from "@/lib/supabase/database.types";

export type ZeitArt = Database["public"]["Enums"]["zeit_art"];

/** Alle Arten in der Reihenfolge, in der sie in der App erscheinen. */
export const ZEIT_ARTEN = [
  "arbeitszeit",
  "fahrtzeit",
  "schlechtwetter",
  "sonstiges",
  "urlaub",
  "unbezahlter_urlaub",
  "krank",
  "kurzarbeit",
  "ueberstundenabbau",
] as const satisfies readonly ZeitArt[];

/**
 * Arten, die der Admin für Mitarbeiter freigeben kann. Überstundenabbau fehlt mit Absicht:
 * Abfeiern läuft nur über einen genehmigten Antrag (Urlaub → „Überstunden abfeiern“).
 */
export const MITARBEITER_ARTEN = ZEIT_ARTEN.filter((a) => a !== "ueberstundenabbau");

export const ZEIT_ART_NAMEN: Record<ZeitArt, string> = {
  arbeitszeit: "Arbeitszeit",
  fahrtzeit: "Fahrtzeit",
  schlechtwetter: "Schlechtwetter",
  sonstiges: "Sonstiges",
  urlaub: "Urlaub",
  unbezahlter_urlaub: "Unbezahlter Urlaub",
  krank: "Krank",
  kurzarbeit: "Kurzarbeit",
  ueberstundenabbau: "Überstundenabbau",
};

export function istZeitArt(wert: unknown): wert is ZeitArt {
  return typeof wert === "string" && (ZEIT_ARTEN as readonly string[]).includes(wert);
}

/** Arbeits- und Fahrtzeit gehören immer zu einer Baustelle (wie in der DB). */
export function brauchtProjekt(art: ZeitArt): boolean {
  return art === "arbeitszeit" || art === "fahrtzeit";
}

// ---------------------------------------------------------------------------
// Einstellungen (app_settings, Schlüssel "zeiterfassung")
// ---------------------------------------------------------------------------
export type ZeiterfassungEinstellungen = {
  erlaubteArten: ZeitArt[];
  standardBeginn: string;
  standardEnde: string;
  standardPauseMin: number;
  /** Freitag: früher Feierabend, kürzere Pause (Beginn wie Mo–Do) */
  freitagEnde: string;
  freitagPauseMin: number;
  kulanzTage: number;
};

export const MAX_PAUSE_MIN = 180;
export const MAX_KULANZ_TAGE = 15;

/** Gleiche Werte wie in der Migration – falls die Einstellung fehlt oder kaputt ist. */
export const STANDARD_EINSTELLUNGEN: ZeiterfassungEinstellungen = {
  erlaubteArten: ["arbeitszeit", "fahrtzeit", "schlechtwetter", "sonstiges"],
  standardBeginn: "06:30",
  standardEnde: "15:45",
  standardPauseMin: 45,
  freitagEnde: "12:45",
  freitagPauseMin: 15,
  kulanzTage: 3,
};

/** Liest den JSON-Wert aus app_settings tolerant ein (Unbekanntes → Standard). */
export function einstellungenLesen(wert: unknown): ZeiterfassungEinstellungen {
  const w = (wert && typeof wert === "object" ? wert : {}) as Record<string, unknown>;
  const s = STANDARD_EINSTELLUNGEN;
  const arten = Array.isArray(w.erlaubte_arten) ? w.erlaubte_arten.filter(istZeitArt) : s.erlaubteArten;
  const ganzzahl = (x: unknown, standard: number, max: number) =>
    typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= max ? x : standard;
  return {
    erlaubteArten: MITARBEITER_ARTEN.filter((a) => arten.includes(a)),
    standardBeginn: istUhrzeit(w.standard_beginn) ? w.standard_beginn : s.standardBeginn,
    standardEnde: istUhrzeit(w.standard_ende) ? w.standard_ende : s.standardEnde,
    standardPauseMin: ganzzahl(w.standard_pause_min, s.standardPauseMin, MAX_PAUSE_MIN),
    freitagEnde: istUhrzeit(w.freitag_ende) ? w.freitag_ende : s.freitagEnde,
    freitagPauseMin: ganzzahl(w.freitag_pause_min, s.freitagPauseMin, MAX_PAUSE_MIN),
    kulanzTage: ganzzahl(w.kulanz_tage, s.kulanzTage, MAX_KULANZ_TAGE),
  };
}

/** Umkehrung von einstellungenLesen: so steht es in der Datenbank. */
export function einstellungenAlsJson(e: ZeiterfassungEinstellungen) {
  return {
    erlaubte_arten: e.erlaubteArten,
    standard_beginn: e.standardBeginn,
    standard_ende: e.standardEnde,
    standard_pause_min: e.standardPauseMin,
    freitag_ende: e.freitagEnde,
    freitag_pause_min: e.freitagPauseMin,
    kulanz_tage: e.kulanzTage,
  };
}


// ---------------------------------------------------------------------------
// Uhrzeiten und Stunden
// ---------------------------------------------------------------------------
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "06:30" (Postgres liefert "06:30:00" – dafür uhrzeitKurz() nutzen). */
export function istUhrzeit(wert: unknown): wert is string {
  return typeof wert === "string" && UHRZEIT.test(wert);
}

/** "06:30:00" → "06:30" (für Werte aus der Datenbank). */
export function uhrzeitKurz(wert: string | null | undefined): string {
  return wert ? wert.slice(0, 5) : "";
}

export function minutenAusUhrzeit(uhrzeit: string): number {
  const [h, m] = uhrzeit.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Arbeitsminuten aus Beginn, Ende und Pause – oder eine Fehlermeldung.
 * Gleiche Regeln wie der Trigger zeit_vorbereiten() in der Datenbank.
 */
export function arbeitsMinuten(
  von: string,
  bis: string,
  pauseMin: number,
): { minuten: number } | { fehler: string } {
  if (!istUhrzeit(von) || !istUhrzeit(bis)) return { fehler: "Bitte Beginn und Ende eingeben." };
  const dauer = minutenAusUhrzeit(bis) - minutenAusUhrzeit(von);
  if (dauer <= 0) return { fehler: "Das Ende muss nach dem Beginn liegen." };
  if (pauseMin > dauer) return { fehler: "Die Pause ist länger als die Arbeitszeit." };
  return { minuten: dauer - pauseMin };
}

/** Minuten → Stunden mit 2 Nachkommastellen (wie in der Datenbank gespeichert). */
export function stundenAusMinuten(minuten: number): number {
  return Math.round((minuten / 60) * 100) / 100;
}

/** Überschneiden sich zwei Zeiträume am selben Tag? (Anschluss 12:00/12:00 ist ok) */
export function ueberschneidetSich(
  a: { von: string; bis: string },
  b: { von: string; bis: string },
): boolean {
  return minutenAusUhrzeit(a.von) < minutenAusUhrzeit(b.bis) && minutenAusUhrzeit(b.von) < minutenAusUhrzeit(a.bis);
}

export type TagesStandard = Pick<ZeiterfassungEinstellungen, "standardBeginn" | "standardEnde" | "standardPauseMin">;

/** Standardzeiten für einen bestimmten Tag: freitags eigenes Ende und eigene Pause. */
export function tagesStandard(datum: string, e: ZeiterfassungEinstellungen): TagesStandard {
  const freitag = new Date(`${datum}T12:00:00Z`).getUTCDay() === 5;
  return {
    standardBeginn: e.standardBeginn,
    standardEnde: freitag ? e.freitagEnde : e.standardEnde,
    standardPauseMin: freitag ? e.freitagPauseMin : e.standardPauseMin,
  };
}

/**
 * Vorschlag für den nächsten Eintrag eines Tages: Standardzeiten, oder – wenn
 * es schon Einträge gibt – Beginn = Ende des letzten Eintrags, ohne zweite Pause.
 */
export function vorschlagFuerTag(
  vorhandene: { von: string | null; bis: string | null; pause_min: number }[],
  e: TagesStandard,
): { von: string; bis: string; pauseMin: number } {
  const enden = vorhandene.map((v) => uhrzeitKurz(v.bis)).filter(istUhrzeit).sort();
  const letztesEnde = enden.at(-1);
  if (!letztesEnde) return { von: e.standardBeginn, bis: e.standardEnde, pauseMin: e.standardPauseMin };
  const pauseSchonDa = vorhandene.some((v) => v.pause_min > 0);
  return {
    von: letztesEnde,
    bis: minutenAusUhrzeit(e.standardEnde) > minutenAusUhrzeit(letztesEnde) ? e.standardEnde : "",
    pauseMin: pauseSchonDa ? 0 : e.standardPauseMin,
  };
}

// ---------------------------------------------------------------------------
// Sperrfrist (wie zeit_noch_aenderbar() in der Datenbank)
// ---------------------------------------------------------------------------

/**
 * Frühester Tag, den ein Mitarbeiter heute noch eintragen oder ändern darf:
 * der Monatserste, bis zum Kulanztag auch der Erste des Vormonats.
 */
export function fruehesterAenderbarerTag(heute: string, kulanzTage: number): string {
  const [jahr, monat, tag] = heute.split("-").map(Number);
  if (tag > kulanzTage) return `${heute.slice(0, 7)}-01`;
  const vorJahr = monat === 1 ? jahr - 1 : jahr;
  const vorMonat = monat === 1 ? 12 : monat - 1;
  return `${vorJahr}-${String(vorMonat).padStart(2, "0")}-01`;
}

/** Darf ein Mitarbeiter diesen Tag noch eintragen/ändern? (Zukunft nie) */
export function zeitNochAenderbar(datum: string, heute: string, kulanzTage: number): boolean {
  return datum <= heute && datum >= fruehesterAenderbarerTag(heute, kulanzTage);
}

/**
 * Welche Baustelle soll vorausgewählt sein? Die Baustelle aus dem Einsatz an
 * dem Tag, für die ich noch nichts eingetragen habe (bei zwei Einsätzen also
 * die zweite). Ohne Einsatz: meine einzige Baustelle, sonst keine.
 */
export function projektVorschlag(
  datum: string,
  einsaetze: { datum: string; projektId: string }[],
  eintraege: { datum: string; projektId: string | null }[],
  meineProjektIds: string[],
): string {
  const eingeteilt = einsaetze
    .filter((e) => e.datum === datum && meineProjektIds.includes(e.projektId))
    .map((e) => e.projektId);
  const schonEingetragen = new Set(eintraege.filter((t) => t.datum === datum).map((t) => t.projektId));
  const offen = eingeteilt.find((id) => !schonEingetragen.has(id));
  if (offen) return offen;
  if (eingeteilt.length) return eingeteilt[0];
  return meineProjektIds.length === 1 ? meineProjektIds[0] : "";
}
