import "server-only";
import type { Bereich, EingangZeile, Zahlstatus } from "@/lib/eingangsrechnung";
import { createClient } from "@/lib/supabase/server";

// Abfragen für Eingangsrechnungen (nur Büro/Admin, die Datenbank erzwingt es per RLS).
// Wer sie aufruft, hat vorher requireRole(BUERO_ROLLEN) geprüft.

type ProjektRef = { name: string; projektnummer: string | null } | null;
type PersonRef = { vorname: string; nachname: string } | null;

function projektText(p: ProjektRef): string {
  return p ? [p.projektnummer, p.name].filter(Boolean).join(" – ") : "";
}

const person = (p: PersonRef) => (p ? `${p.vorname} ${p.nachname}`.trim() : "");

/** Liste (höchstens `limit` Zeilen, neueste Rechnungen zuerst). */
export async function eingangsrechnungenLaden(optionen: { archiv: boolean; limit?: number }): Promise<EingangZeile[]> {
  const supabase = await createClient();
  let abfrage = supabase
    .from("incoming_invoices")
    .select(
      "id, lieferant, rechnungsnummer, rechnungsdatum, faellig_am, netto, brutto, zahlstatus, project_id, bereich, zu_pruefen, dateiname, quelle, created_at, projects(name, projektnummer), profiles!incoming_invoices_erstellt_von_fkey(vorname, nachname)",
    )
    .order("rechnungsdatum", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(optionen.limit ?? 1000);
  abfrage = optionen.archiv ? abfrage.not("archiviert_am", "is", null) : abfrage.is("archiviert_am", null);
  const { data, error } = await abfrage;
  if (error) throw new Error("Die Eingangsrechnungen konnten nicht geladen werden.");
  return (data ?? []).map((r) => ({
    id: r.id,
    lieferant: r.lieferant,
    rechnungsnummer: r.rechnungsnummer ?? "",
    rechnungsdatum: r.rechnungsdatum,
    faelligAm: r.faellig_am,
    netto: r.netto === null ? null : Number(r.netto),
    brutto: r.brutto === null ? null : Number(r.brutto),
    zahlstatus: r.zahlstatus as Zahlstatus,
    projectId: r.project_id,
    projektText: projektText(r.projects as ProjektRef),
    bereich: r.bereich as Bereich | null,
    zuPruefen: r.zu_pruefen,
    dateiname: r.dateiname,
    quelle: r.quelle as "upload" | "email",
    hochgeladenAm: r.created_at,
    hochgeladenVon: r.quelle === "email" ? "E-Mail" : person(r.profiles as PersonRef),
  }));
}

export type EingangDetail = {
  zeile: EingangZeile;
  iban: string;
  bezahltAm: string | null;
  notiz: string;
  absender: string;
  erkanntAus: "e-rechnung" | "pdf-text" | "ki" | "keine" | null;
  mime: string;
  archiviert: boolean;
  /** Signierte Adresse zum Ansehen (1 Stunde gültig) */
  dateiUrl: string | null;
};

export async function eingangsrechnungLaden(id: string): Promise<EingangDetail | null> {
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("incoming_invoices")
    .select(
      "id, lieferant, rechnungsnummer, rechnungsdatum, faellig_am, netto, brutto, iban, zahlstatus, bezahlt_am, project_id, bereich, zu_pruefen, notiz, storage_pfad, dateiname, mime, absender, quelle, erkannt_aus, archiviert_am, created_at, projects(name, projektnummer), profiles!incoming_invoices_erstellt_von_fkey(vorname, nachname)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Die Rechnung konnte nicht geladen werden.");
  if (!r) return null;
  const { data: signiert } = await supabase.storage.from("eingangsrechnungen").createSignedUrl(r.storage_pfad, 3600);
  return {
    zeile: {
      id: r.id,
      lieferant: r.lieferant,
      rechnungsnummer: r.rechnungsnummer ?? "",
      rechnungsdatum: r.rechnungsdatum,
      faelligAm: r.faellig_am,
      netto: r.netto === null ? null : Number(r.netto),
      brutto: r.brutto === null ? null : Number(r.brutto),
      zahlstatus: r.zahlstatus as Zahlstatus,
      projectId: r.project_id,
      projektText: projektText(r.projects as ProjektRef),
      bereich: r.bereich as Bereich | null,
      zuPruefen: r.zu_pruefen,
      dateiname: r.dateiname,
      quelle: r.quelle as "upload" | "email",
      hochgeladenAm: r.created_at,
      hochgeladenVon: r.quelle === "email" ? "E-Mail" : person(r.profiles as PersonRef),
    },
    iban: r.iban ?? "",
    bezahltAm: r.bezahlt_am,
    notiz: r.notiz ?? "",
    absender: r.absender ?? "",
    erkanntAus: r.erkannt_aus as EingangDetail["erkanntAus"],
    mime: r.mime ?? "",
    archiviert: r.archiviert_am !== null,
    dateiUrl: signiert?.signedUrl ?? null,
  };
}

/** Projekte zur Auswahl der Kostenzuweisung (nicht archivierte, neueste zuerst). */
export async function projekteFuerZuweisung(): Promise<{ id: string; text: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, projektnummer")
    .is("archiviert_am", null)
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((p) => ({ id: p.id, text: [p.projektnummer, p.name].filter(Boolean).join(" – ") }));
}

/** Anzahl der Eingangsrechnungen, die noch geprüft werden müssen (für Reiter und Übersicht). */
export async function eingangsrechnungenZuPruefen(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("incoming_invoices").select("id", { count: "exact", head: true }).eq("zu_pruefen", true).is("archiviert_am", null);
  return count ?? 0;
}
