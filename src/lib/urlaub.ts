// Urlaubsanträge (auch im Browser nutzbar). Genehmigen darf nur der Admin –
// das prüft die Datenbank (Trigger urlaub_pruefen + RLS).

import { feiertagName } from "@/lib/feiertage";
import type { Database } from "@/lib/supabase/database.types";

export type UrlaubStatus = Database["public"]["Enums"]["urlaub_status"];
/** „ueberstundenabbau“ (Abfeiern) ist eine Unterkategorie von Urlaub: Es verbraucht keinen Urlaubsanspruch, sondern Überstunden. */
export type UrlaubArt = "urlaub" | "unbezahlter_urlaub" | "ueberstundenabbau";

export const URLAUB_ARTEN = ["urlaub", "unbezahlter_urlaub", "ueberstundenabbau"] as const satisfies readonly UrlaubArt[];
export const URLAUB_ART_NAMEN: Record<UrlaubArt, string> = {
  urlaub: "Urlaub",
  unbezahlter_urlaub: "Unbezahlter Urlaub",
  ueberstundenabbau: "Überstunden abfeiern",
};

export const URLAUB_STATUS_NAMEN: Record<UrlaubStatus, string> = {
  offen: "Offen",
  genehmigt: "Genehmigt",
  abgelehnt: "Abgelehnt",
  zurueckgezogen: "Zurückgezogen",
};

/** Farben der Status-Kennzeichnung (Tailwind-Klassen). */
export const URLAUB_STATUS_FARBE: Record<UrlaubStatus, string> = {
  offen: "bg-amber-100 text-amber-900",
  genehmigt: "bg-green-100 text-green-900",
  abgelehnt: "bg-red-100 text-red-900",
  zurueckgezogen: "bg-muted text-muted-foreground",
};

/**
 * Werktage Montag–Freitag zwischen zwei Daten (beide eingeschlossen),
 * ohne gesetzliche Feiertage in Niedersachsen.
 */
export function werktage(von: string, bis: string): number {
  if (bis < von) return 0;
  const start = new Date(`${von}T12:00:00Z`);
  const ende = new Date(`${bis}T12:00:00Z`);
  let tage = 0;
  for (const d = start; d <= ende; d.setUTCDate(d.getUTCDate() + 1)) {
    const wochentag = d.getUTCDay();
    if (wochentag !== 0 && wochentag !== 6 && !feiertagName(d.toISOString().slice(0, 10))) tage++;
  }
  return tage;
}

/** Werktage eines Zeitraums, die in einem Kalenderjahr liegen. */
export function werktageImJahr(von: string, bis: string, jahr: number): number {
  const anfang = `${jahr}-01-01`;
  const ende = `${jahr}-12-31`;
  return werktage(von > anfang ? von : anfang, bis < ende ? bis : ende);
}

export type Urlaubskonto = {
  jahr: number;
  /** null = Anspruch noch nicht eingetragen */
  anspruch: number | null;
  genehmigt: number;
  beantragt: number;
  rest: number | null;
};

/**
 * Urlaubskonto für ein Kalenderjahr (ohne Übertrag). Zählt nur bezahlten
 * Urlaub; unbezahlter Urlaub verbraucht keinen Anspruch.
 */
export function urlaubskonto(
  anspruch: number | null,
  antraege: { von: string; bis: string; art: string; status: UrlaubStatus }[],
  jahr: number,
): Urlaubskonto {
  const summe = (status: UrlaubStatus) =>
    antraege
      .filter((a) => a.art === "urlaub" && a.status === status)
      .reduce((s, a) => s + werktageImJahr(a.von, a.bis, jahr), 0);
  const genehmigt = summe("genehmigt");
  return { jahr, anspruch, genehmigt, beantragt: summe("offen"), rest: anspruch == null ? null : anspruch - genehmigt };
}

export type Ruecknahme = { art: "ganz" } | { art: "rest"; neuesBis: string } | { fehler: string };

/**
 * Was passiert, wenn der Admin einen genehmigten Antrag zurücknimmt?
 * „ganz“: der ganze Antrag wird zurückgezogen, alle gebuchten Tage verschwinden.
 * „rest“: nur die Tage ab heute fallen weg, der Antrag endet gestern und vergangene Tage bleiben gebucht.
 * Beginnt der Antrag erst heute oder später, ist „rest“ dasselbe wie „ganz“.
 */
export function ruecknahmePlan(antrag: { von: string; bis: string }, heute: string, umfang: "ganz" | "rest"): Ruecknahme {
  if (antrag.bis < heute) return { fehler: "Der Zeitraum liegt schon in der Vergangenheit. Da gibt es nichts mehr zurückzunehmen." };
  if (umfang === "ganz" || antrag.von >= heute) return { art: "ganz" };
  const gestern = new Date(Date.UTC(Number(heute.slice(0, 4)), Number(heute.slice(5, 7)) - 1, Number(heute.slice(8, 10)) - 1));
  return { art: "rest", neuesBis: gestern.toISOString().slice(0, 10) };
}
