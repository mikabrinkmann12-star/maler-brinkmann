// Angebotsliste wie in Plancraft: Entwurf/Fertiggestellt, Annahmestatus und Versandstatus (reine Logik, auch im Browser nutzbar).
// Unsere Angebote haben einen einzigen Status (entwurf / versendet / angenommen / abgelehnt) plus „versendet_am“; die drei Sichten werden davon abgeleitet.

import type { AngebotStatus } from "@/lib/angebot";

export type Annahme = "ausstehend" | "angenommen" | "abgelehnt";
export type Versand = "nicht_gesendet" | "gesendet" | "geoeffnet";
export type StatusFilterId = "entwurf" | "fertig" | Annahme | Versand;

export const ANNAHME_NAMEN: Record<Annahme, string> = { ausstehend: "Ausstehend", angenommen: "Angenommen", abgelehnt: "Abgelehnt" };
export const ANNAHME_FARBEN: Record<Annahme, string> = { ausstehend: "#d99a1c", angenommen: "#3fa66a", abgelehnt: "#e5484d" };

export function annahmeVon(status: AngebotStatus): Annahme {
  return status === "angenommen" ? "angenommen" : status === "abgelehnt" ? "abgelehnt" : "ausstehend";
}

/** Versandstatus: nicht gesendet, gesendet (Kunde hat den Link noch nicht geöffnet) oder geöffnet (Kunde hat die Online-Ansicht geöffnet). */
export function versandVon(versendetAm: string | null | undefined, geoeffnetAm?: string | null): Versand {
  return geoeffnetAm ? "geoeffnet" : versendetAm ? "gesendet" : "nicht_gesendet";
}

/** Einträge des Status-Filters, in Gruppen wie in Plancraft. */
export const STATUS_FILTER: { id: StatusFilterId; gruppe: string; text: string; farbe: string }[] = [
  { id: "entwurf", gruppe: "Status", text: "Entwurf", farbe: "#6b7280" },
  { id: "fertig", gruppe: "Status", text: "Fertiggestellt", farbe: "#3b82f6" },
  { id: "ausstehend", gruppe: "Annahmestatus", text: "Ausstehend", farbe: ANNAHME_FARBEN.ausstehend },
  { id: "angenommen", gruppe: "Annahmestatus", text: "Angenommen", farbe: ANNAHME_FARBEN.angenommen },
  { id: "abgelehnt", gruppe: "Annahmestatus", text: "Abgelehnt", farbe: ANNAHME_FARBEN.abgelehnt },
  { id: "nicht_gesendet", gruppe: "Versandstatus", text: "Nicht gesendet", farbe: "#6b7280" },
  { id: "gesendet", gruppe: "Versandstatus", text: "Gesendet", farbe: "#3b82f6" },
  { id: "geoeffnet", gruppe: "Versandstatus", text: "Geöffnet", farbe: "#3fa66a" },
];

export function istStatusFilterId(wert: unknown): wert is StatusFilterId {
  return STATUS_FILTER.some((s) => s.id === wert);
}

export type FilterbaresAngebot = {
  status: AngebotStatus;
  versendetAm: string | null;
  /** Erstes Öffnen der Online-Ansicht durch den Kunden */
  geoeffnetAm?: string | null;
  datum: string;
  projektId: string;
  projektArchiviert: boolean;
};

export type AngebotFilter = {
  von?: string | null;
  bis?: string | null;
  /** Auswahl aus dem Status-Filter; innerhalb einer Gruppe gilt „oder“, zwischen den Gruppen „und“ */
  status: StatusFilterId[];
  projektIds: string[];
  nurAktiveProjekte: boolean;
};

export function angeboteFiltern<T extends FilterbaresAngebot>(zeilen: readonly T[], f: AngebotFilter): T[] {
  const gruppe = (ids: StatusFilterId[], erlaubt: StatusFilterId[]) => ids.filter((i) => erlaubt.includes(i));
  const art = gruppe(f.status, ["entwurf", "fertig"]);
  const annahme = gruppe(f.status, ["ausstehend", "angenommen", "abgelehnt"]);
  const versand = gruppe(f.status, ["nicht_gesendet", "gesendet", "geoeffnet"]);
  return zeilen.filter((z) => {
    if (f.von && z.datum < f.von) return false;
    if (f.bis && z.datum > f.bis) return false;
    if (f.projektIds.length && !f.projektIds.includes(z.projektId)) return false;
    if (f.nurAktiveProjekte && z.projektArchiviert) return false;
    if (art.length && !art.includes(z.status === "entwurf" ? "entwurf" : "fertig")) return false;
    if (annahme.length && !annahme.includes(annahmeVon(z.status))) return false;
    if (versand.length && !versand.includes(versandVon(z.versendetAm, z.geoeffnetAm))) return false;
    return true;
  });
}

/** Summe in Cent genau (Beträge mit zwei Nachkommastellen). */
export function summe(betraege: readonly number[]): number {
  return betraege.reduce((s, b) => s + Math.round(b * 100), 0) / 100;
}
