// Dashboard fürs Büro: reine Rechenhilfen (Fälligkeit, Summen, Zählungen). Die Abfragen stehen in dashboard-daten.ts.
import { monatVerschieben, monatsGrenzen, tageVerschieben } from "@/lib/datum";

/** Fälligkeitsdatum einer Rechnung: Rechnungsdatum + Zahlungsziel in Tagen. Ohne Zahlungsziel gibt es keine Fälligkeit (null). */
export function faelligAm(rechnungsdatum: string, zahlungszielTage: number | null): string | null {
  if (zahlungszielTage == null || zahlungszielTage < 0) return null;
  return tageVerschieben(rechnungsdatum, zahlungszielTage);
}

export type OffeneRechnung = {
  status: "entwurf" | "wird_uebertragen" | "uebertragen";
  lexwareStatus: string;
  rechnungsdatum: string;
  zahlungszielTage: number | null;
  brutto: number | null;
  /** 0 = nicht gemahnt, sonst Stufe der Mahnung (vom Büro vermerkt) */
  mahnstufe?: number;
};

const cent = (euro: number) => Math.round(euro * 100);

/**
 * Offene Forderungen aus den Rechnungen, die Lexware zuletzt gemeldet hat („Stand vom letzten Abgleich“):
 * offen = übertragen und bei Lexware „open“; überfällig = offen und Fälligkeit liegt vor heute.
 */
export function forderungen(rechnungen: OffeneRechnung[], heute: string) {
  let offen = { anzahl: 0, cent: 0 };
  let ueberfaellig = { anzahl: 0, cent: 0 };
  for (const r of rechnungen) {
    if (r.status !== "uebertragen" || r.lexwareStatus !== "open") continue;
    const betrag = r.brutto == null ? 0 : cent(r.brutto);
    offen = { anzahl: offen.anzahl + 1, cent: offen.cent + betrag };
    const faellig = faelligAm(r.rechnungsdatum, r.zahlungszielTage);
    if (faellig && faellig < heute) ueberfaellig = { anzahl: ueberfaellig.anzahl + 1, cent: ueberfaellig.cent + betrag };
  }
  return {
    offen: { anzahl: offen.anzahl, summe: offen.cent / 100 },
    ueberfaellig: { anzahl: ueberfaellig.anzahl, summe: ueberfaellig.cent / 100 },
  };
}

// ---------------------------------------------------------------------------
// „Offene Forderungen“ wie in Plancraft: eine große Summe, darunter Offen / Überfällig, wählbarer Zeitraum (nach Rechnungsdatum)
// ---------------------------------------------------------------------------

export const FORDERUNGS_ZEITRAEUME = [
  ["90_tage", "Letzte 90 Tage"],
  ["monat", "Aktueller Monat"],
  ["letzter_monat", "Letzter Monat"],
  ["jahr", "Aktuelles Jahr"],
  ["letztes_jahr", "Letztes Jahr"],
] as const;
export type ForderungsZeitraum = (typeof FORDERUNGS_ZEITRAEUME)[number][0];
export const FORDERUNGS_STANDARD: ForderungsZeitraum = "90_tage";

export function istForderungsZeitraum(wert: unknown): wert is ForderungsZeitraum {
  return FORDERUNGS_ZEITRAEUME.some(([id]) => id === wert);
}

/** Von–bis (inklusive) für einen Zeitraum der Forderungsübersicht. */
export function forderungsBereich(zeitraum: ForderungsZeitraum, heute: string): { von: string; bis: string } {
  const jahr = Number(heute.slice(0, 4));
  switch (zeitraum) {
    case "90_tage":
      return { von: tageVerschieben(heute, -89), bis: heute };
    case "monat": {
      const g = monatsGrenzen(heute.slice(0, 7));
      return { von: g.erster, bis: g.letzter };
    }
    case "letzter_monat": {
      const g = monatsGrenzen(monatVerschieben(heute.slice(0, 7), -1));
      return { von: g.erster, bis: g.letzter };
    }
    case "jahr":
      return { von: `${jahr}-01-01`, bis: `${jahr}-12-31` };
    case "letztes_jahr":
      return { von: `${jahr - 1}-01-01`, bis: `${jahr - 1}-12-31` };
  }
}

/**
 * Gesamtsumme der offenen Forderungen, aufgeteilt in drei Gruppen ohne Überschneidung: „Angemahnt“ (Mahnung vermerkt, rot),
 * „Überfällig“ (Zahlungsziel überschritten, nicht gemahnt) und „Offen“ (noch nicht fällig). Nur Rechnungen im Zeitraum zählen.
 */
export function forderungsUebersicht(rechnungen: OffeneRechnung[], heute: string, bereich: { von: string; bis: string }) {
  const imZeitraum = rechnungen.filter((r) => r.rechnungsdatum >= bereich.von && r.rechnungsdatum <= bereich.bis);
  const istOffen = (r: OffeneRechnung) => r.status === "uebertragen" && r.lexwareStatus === "open";
  const gemahnt = imZeitraum.filter((r) => istOffen(r) && (r.mahnstufe ?? 0) > 0);
  const uebrige = imZeitraum.filter((r) => !gemahnt.includes(r));
  const f = forderungen(uebrige, heute);
  const angemahntCent = gemahnt.reduce((s, r) => s + (r.brutto == null ? 0 : cent(r.brutto)), 0);
  const offenCent = Math.round(f.offen.summe * 100) - Math.round(f.ueberfaellig.summe * 100);
  return {
    gesamt: { anzahl: f.offen.anzahl + gemahnt.length, summe: (Math.round(f.offen.summe * 100) + angemahntCent) / 100 },
    offen: { anzahl: f.offen.anzahl - f.ueberfaellig.anzahl, summe: offenCent / 100 },
    ueberfaellig: f.ueberfaellig,
    angemahnt: { anzahl: gemahnt.length, summe: angemahntCent / 100 },
  };
}

export type StatusAnzahl ={ id: string; name: string; farbe: string; sortierung: number; anzahl: number };

/** Nicht archivierte Projekte je Status zählen (nur Status mit mindestens einem Projekt), in der Reihenfolge der Einstellungen. */
export function projekteNachStatus(
  projekte: { status_id: string | null; project_statuses: { name: string; farbe: string; sortierung: number } | null }[],
): StatusAnzahl[] {
  const karte = new Map<string, StatusAnzahl>();
  for (const p of projekte) {
    if (!p.status_id || !p.project_statuses) continue;
    const alt = karte.get(p.status_id);
    if (alt) alt.anzahl += 1;
    else karte.set(p.status_id, { id: p.status_id, ...p.project_statuses, anzahl: 1 });
  }
  return [...karte.values()].sort((a, b) => a.sortierung - b.sortierung || a.name.localeCompare(b.name, "de"));
}

/** Zahl der ungelesenen Chat-Nachrichten und der betroffenen Projekte aus `chat_ungelesen()`. */
export function chatSumme(zeilen: { anzahl: number | string }[] | null | undefined): { nachrichten: number; projekte: number } {
  const liste = (zeilen ?? []).map((z) => Number(z.anzahl)).filter((n) => n > 0);
  return { nachrichten: liste.reduce((a, b) => a + b, 0), projekte: liste.length };
}
