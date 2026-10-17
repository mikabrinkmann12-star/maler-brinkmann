// Dashboard fürs Büro: reine Rechenhilfen (Fälligkeit, Summen, Zählungen). Die Abfragen stehen in dashboard-daten.ts.
import { tageVerschieben } from "@/lib/datum";

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

export type StatusAnzahl = { id: string; name: string; farbe: string; sortierung: number; anzahl: number };

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
