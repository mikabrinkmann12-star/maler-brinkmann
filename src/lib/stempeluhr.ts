// Stempeluhr: aus Einstempel- und Ausstempelzeit wird ein Zeiteintrag (auch im Browser nutzbar).

import { ZEITZONE } from "@/lib/format";
import { minutenAusUhrzeit, tagesStandard, type ZeiterfassungEinstellungen } from "@/lib/zeiten";

const teile = new Intl.DateTimeFormat("sv-SE", {
  timeZone: ZEITZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Datum ("JJJJ-MM-TT") und Uhrzeit ("HH:MM") eines Zeitpunkts in deutscher Zeit. */
export function berlinZeit(zeitpunkt: Date): { datum: string; uhrzeit: string } {
  const p = Object.fromEntries(teile.formatToParts(zeitpunkt).map((t) => [t.type, t.value]));
  return { datum: `${p.year}-${p.month}-${p.day}`, uhrzeit: `${p.hour}:${p.minute}` };
}

/** Ab so vielen Arbeitsminuten gilt automatisch die Standardpause (gesetzlich: nach 6 Stunden). */
export const PAUSE_AB_MINUTEN = 6 * 60;

export type StempelEintrag = {
  datum: string;
  von: string;
  bis: string;
  pauseMin: number;
  /** Hinweis für den Mitarbeiter (z. B. „über Mitternacht“), sonst leer */
  hinweis: string;
};

/**
 * Zeiteintrag aus der Stempeluhr. Beginn und Ende werden auf die Minute gekürzt.
 * - Über Mitternacht: Der Eintrag endet um 23:59, damit nichts Falsches gebucht wird (Hinweis zum Korrigieren).
 * - Pause: Standardpause des Tages, wenn mindestens 6 Stunden gearbeitet wurden und an dem Tag noch keine Pause eingetragen ist.
 */
export function stempelEintrag(
  start: Date,
  ende: Date,
  einstellungen: ZeiterfassungEinstellungen,
  pauseSchonDa: boolean,
): StempelEintrag | { fehler: string } {
  const a = berlinZeit(start);
  const b = berlinZeit(ende);
  const ueberMitternacht = b.datum !== a.datum;
  const bis = ueberMitternacht ? "23:59" : b.uhrzeit;
  const dauer = minutenAusUhrzeit(bis) - minutenAusUhrzeit(a.uhrzeit);
  if (dauer <= 0) return { fehler: "Das war weniger als eine Minute. Es wurde nichts eingetragen." };

  const standardPause = tagesStandard(a.datum, einstellungen).standardPauseMin;
  const pauseMin = !pauseSchonDa && dauer >= PAUSE_AB_MINUTEN && standardPause < dauer ? standardPause : 0;
  return {
    datum: a.datum,
    von: a.uhrzeit,
    bis,
    pauseMin,
    hinweis: ueberMitternacht
      ? "Die Uhr lief über Mitternacht. Der Eintrag endet deshalb um 23:59. Bitte das richtige Ende eintragen."
      : "",
  };
}

/** Laufzeit als „H:MM:SS“ (Anzeige des Timers). */
export function laufzeitText(millisekunden: number): string {
  const s = Math.max(0, Math.floor(millisekunden / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
