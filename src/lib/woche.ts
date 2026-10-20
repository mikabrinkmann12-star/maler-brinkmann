// Wochen-Hilfen für die Mitarbeiter-App (Einsätze, Zeiten). Alle Daten als "JJJJ-MM-TT".
// Auch im Browser nutzbar.

import { tageVerschieben, tageZwischen } from "@/lib/datum";

export const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
const WOCHENTAGE_LANG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;

/** Wochentag-Nummer: Montag = 0 … Sonntag = 6. */
export function wochentagNr(iso: string): number {
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function wochentagLang(iso: string): string {
  return WOCHENTAGE_LANG[wochentagNr(iso)];
}

/** Montag der Woche, in der `iso` liegt. */
export function wochenstart(iso: string): string {
  return tageVerschieben(iso, -wochentagNr(iso));
}

/** Die sieben Tage (Mo–So) der Woche, in der `iso` liegt. */
export function wochenTage(iso: string): string[] {
  const montag = wochenstart(iso);
  return Array.from({ length: 7 }, (_, i) => tageVerschieben(montag, i));
}

// Feste Abkürzungen (Intl liefert je nach System mit oder ohne Punkt)
const MONATE_KURZ = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];

function tagMonat(iso: string): { tag: number; monat: string; jahr: number } {
  const d = new Date(`${iso}T12:00:00Z`);
  return { tag: d.getUTCDate(), monat: MONATE_KURZ[d.getUTCMonth()], jahr: d.getUTCFullYear() };
}

/** „20. Okt. 2026“ */
export function tagMitMonat(iso: string): string {
  const t = tagMonat(iso);
  return `${t.tag}. ${t.monat} ${t.jahr}`;
}

/** „19.–25. Okt.“ bzw. „28. Sept.–4. Okt.“ für die Woche mit diesem Montag. */
export function wochenTitel(montag: string): string {
  const von = tagMonat(montag);
  const bis = tagMonat(tageVerschieben(montag, 6));
  return von.monat === bis.monat ? `${von.tag}.–${bis.tag}. ${bis.monat}` : `${von.tag}. ${von.monat}–${bis.tag}. ${bis.monat}`;
}

/** „Heute, 20. Okt. 2026“, „Morgen, …“, „Gestern, …“, sonst „Mi., 21. Okt. 2026“. */
export function tagesTitel(iso: string, heute: string): string {
  const abstand = tageZwischen(heute, iso);
  const vorne = abstand === 0 ? "Heute" : abstand === 1 ? "Morgen" : abstand === -1 ? "Gestern" : `${WOCHENTAGE_KURZ[wochentagNr(iso)]}.`;
  return `${vorne}, ${tagMitMonat(iso)}`;
}

/** Tag des Monats als Zahl („20“). */
export function tagZahl(iso: string): number {
  return Number(iso.slice(8, 10));
}
