// Rechnungsliste wie bei „Ausgangsrechnungen“ in Plancraft: Status (Offen, Überfällig, Bezahlt …), Fälligkeit, offener Betrag.
// Alles beruht auf dem, was Lexware zuletzt gemeldet hat (Stand vom letzten Abgleich). Reine Logik, auch im Browser nutzbar.

import { tageZwischen } from "@/lib/datum";
import { faelligAm } from "@/lib/dashboard";

export type RechnungAnzeigeStatus = "entwurf" | "uebertragung" | "offen" | "ueberfaellig" | "angemahnt" | "bezahlt" | "storniert";

export const RECHNUNG_ANZEIGE_NAMEN: Record<RechnungAnzeigeStatus, string> = {
  entwurf: "Entwurf",
  uebertragung: "Wird übertragen",
  offen: "Offen",
  ueberfaellig: "Überfällig",
  angemahnt: "Angemahnt",
  bezahlt: "Bezahlt",
  storniert: "Storniert",
};

/** Farben wie in Plancraft: Offen blau, Bezahlt grün, Überfällig gelb, Angemahnt rot. */
export const RECHNUNG_ANZEIGE_FARBEN: Record<RechnungAnzeigeStatus, string> = {
  entwurf: "#6b7280",
  uebertragung: "#d99a1c",
  offen: "#3b82f6",
  ueberfaellig: "#d99a1c",
  angemahnt: "#e5484d",
  bezahlt: "#3fa66a",
  storniert: "#e5484d",
};

export function istRechnungAnzeigeStatus(wert: unknown): wert is RechnungAnzeigeStatus {
  return typeof wert === "string" && wert in RECHNUNG_ANZEIGE_NAMEN;
}

export type RechnungZeile = {
  status: "entwurf" | "wird_uebertragen" | "uebertragen";
  lexwareStatus: string;
  rechnungsdatum: string;
  zahlungszielTage: number | null;
  brutto: number;
  /** 0 = nicht gemahnt, 1 = Zahlungserinnerung, 2 = 1. Mahnung, 3 = 2. Mahnung (vom Büro vermerkt) */
  mahnstufe?: number;
};

export function anzeigeStatus(r: Pick<RechnungZeile, "status" | "lexwareStatus" | "rechnungsdatum" | "zahlungszielTage" | "mahnstufe">, heute: string): RechnungAnzeigeStatus {
  if (r.status === "entwurf") return "entwurf";
  if (r.status === "wird_uebertragen") return "uebertragung";
  if (r.lexwareStatus === "paid" || r.lexwareStatus === "paidoff") return "bezahlt";
  if (r.lexwareStatus === "voided") return "storniert";
  if (r.lexwareStatus === "draft") return "entwurf";
  if ((r.mahnstufe ?? 0) > 0) return "angemahnt";
  const faellig = faelligAm(r.rechnungsdatum, r.zahlungszielTage);
  return faellig && faellig < heute ? "ueberfaellig" : "offen";
}

export type RechnungFilter = { von?: string | null; bis?: string | null; status: RechnungAnzeigeStatus[]; projektIds: string[] };

/** Filter der Rechnungsliste (Zeitraum nach Rechnungsdatum). `anzeige` ist der Wert aus `anzeigeStatus`. */
export function rechnungenFiltern<T extends { rechnungsdatum: string; projektId: string; anzeige: RechnungAnzeigeStatus }>(zeilen: readonly T[], f: RechnungFilter): T[] {
  return zeilen.filter(
    (z) =>
      (!f.von || z.rechnungsdatum >= f.von) &&
      (!f.bis || z.rechnungsdatum <= f.bis) &&
      (!f.status.length || f.status.includes(z.anzeige)) &&
      (!f.projektIds.length || f.projektIds.includes(z.projektId)),
  );
}

/** Fälligkeit für offene und überfällige Rechnungen: „8 Tage“, „Heute“, „-1 Tag“; sonst leer. */
export function faelligText(r: Pick<RechnungZeile, "rechnungsdatum" | "zahlungszielTage">, status: RechnungAnzeigeStatus, heute: string): string {
  if (status !== "offen" && status !== "ueberfaellig" && status !== "angemahnt") return "";
  const faellig = faelligAm(r.rechnungsdatum, r.zahlungszielTage);
  if (!faellig) return "";
  const tage = tageZwischen(heute, faellig);
  if (tage === 0) return "Heute";
  return `${tage} ${Math.abs(tage) === 1 ? "Tag" : "Tage"}`;
}

/** Offener Betrag: nur bei offenen und überfälligen Rechnungen der volle Bruttobetrag. */
export function offenerBetrag(r: Pick<RechnungZeile, "brutto">, status: RechnungAnzeigeStatus): number {
  return status === "offen" || status === "ueberfaellig" || status === "angemahnt" ? r.brutto : 0;
}

/** Fälligkeit für die Rechnungsseite: „In 7 Tagen“, „Heute“, „3 Tage überfällig“; ohne Fälligkeit „–“. */
export function faelligBeschreibung(faellig: string | null, heute: string): string {
  if (!faellig) return "–";
  const tage = tageZwischen(heute, faellig);
  if (tage === 0) return "Heute";
  if (tage > 0) return `In ${tage} ${tage === 1 ? "Tag" : "Tagen"}`;
  return `${-tage} ${tage === -1 ? "Tag" : "Tage"} überfällig`;
}
