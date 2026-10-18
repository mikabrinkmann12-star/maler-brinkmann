import "server-only";
import { kontaktName, adresseText } from "@/lib/projekt";
import { rechnungBerechnen, type RechnungStatus, type RechnungsBaustein } from "@/lib/rechnung";
import { suchtext } from "@/lib/suche";
import { createClient } from "@/lib/supabase/server";

// Abfragen für Rechnungen (nur Büro/Admin, die Datenbank erzwingt es per RLS).
// Wer sie aufruft, hat vorher requireRole(BUERO_ROLLEN) geprüft.

export type RechnungKopf = {
  id: string;
  projectId: string;
  quoteId: string | null;
  contactId: string;
  status: RechnungStatus;
  betreff: string;
  rechnungsdatum: string;
  leistungVon: string;
  leistungBis: string;
  zahlungszielTage: number;
  skontoProzent: number | null;
  skontoTage: number | null;
  steuersatz: number;
  reverseCharge: boolean;
  rabattProzent: number;
  einleitung: string;
  schlusstext: string;
  lexwareId: string | null;
  rechnungsnummer: string;
  lexwareStatus: string;
  netto: number | null;
  brutto: number | null;
  uebertragenAm: string | null;
  abgeglichenAm: string | null;
  pdfPfad: string | null;
  archiviert: boolean;
  mahnstufe: number;
  angemahntAm: string | null;
};

export type RechnungDetail = {
  rechnung: RechnungKopf;
  bausteine: (RechnungsBaustein & { id: string })[];
  projekt: { id: string; name: string; projektnummer: string; adresse: string };
  kunde: { id: string; name: string; kundennummer: string; lexwareKontaktId: string | null; leitwegId: string };
  angebot: { id: string; betreff: string } | null;
};

export async function rechnungLaden(id: string): Promise<RechnungDetail | null> {
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("invoices")
    .select(
      "id, project_id, quote_id, contact_id, status, betreff, rechnungsdatum, leistung_von, leistung_bis, zahlungsziel_tage, skonto_prozent, skonto_tage, steuersatz, reverse_charge, rabatt_prozent, einleitung, schlusstext, lexware_id, rechnungsnummer, lexware_status, netto, brutto, uebertragen_am, abgeglichen_am, pdf_pfad, archiviert_am, mahnstufe, angemahnt_am, projects(id, name, projektnummer, baustelle_strasse, baustelle_plz, baustelle_ort), contacts(id, kundennummer, firmenname, vorname, nachname, lexware_contact_id, leitweg_id), quotes(id, betreff)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Die Rechnung konnte nicht geladen werden.");
  if (!r) return null;

  const { data: items, error: itemsFehler } = await supabase
    .from("invoice_items")
    .select("id, typ, kurztext, langtext, menge, einheit, einzelpreis")
    .eq("invoice_id", id)
    .order("sortierung")
    .order("created_at")
    .limit(2000);
  if (itemsFehler) throw new Error("Die Positionen konnten nicht geladen werden.");

  const p = r.projects;
  const k = r.contacts;
  return {
    rechnung: {
      id: r.id,
      projectId: r.project_id,
      quoteId: r.quote_id,
      contactId: r.contact_id,
      status: r.status,
      betreff: r.betreff,
      rechnungsdatum: r.rechnungsdatum,
      leistungVon: r.leistung_von,
      leistungBis: r.leistung_bis,
      zahlungszielTage: r.zahlungsziel_tage,
      skontoProzent: r.skonto_prozent == null ? null : Number(r.skonto_prozent),
      skontoTage: r.skonto_tage,
      steuersatz: Number(r.steuersatz),
      reverseCharge: r.reverse_charge,
      rabattProzent: Number(r.rabatt_prozent),
      einleitung: r.einleitung ?? "",
      schlusstext: r.schlusstext ?? "",
      lexwareId: r.lexware_id,
      rechnungsnummer: r.rechnungsnummer ?? "",
      lexwareStatus: r.lexware_status ?? "",
      netto: r.netto == null ? null : Number(r.netto),
      brutto: r.brutto == null ? null : Number(r.brutto),
      uebertragenAm: r.uebertragen_am,
      abgeglichenAm: r.abgeglichen_am,
      pdfPfad: r.pdf_pfad,
      archiviert: r.archiviert_am != null,
      mahnstufe: r.mahnstufe,
      angemahntAm: r.angemahnt_am,
    },
    bausteine: items.map((i) => ({
      id: i.id,
      typ: i.typ,
      kurztext: i.kurztext ?? "",
      langtext: i.langtext ?? "",
      menge: i.menge == null ? null : Number(i.menge),
      einheit: i.einheit ?? "",
      einzelpreis: i.einzelpreis == null ? null : Number(i.einzelpreis),
    })),
    projekt: {
      id: r.project_id,
      name: p?.name ?? "",
      projektnummer: p?.projektnummer ?? "",
      adresse: p ? adresseText({ strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort }) : "",
    },
    kunde: {
      id: r.contact_id,
      name: kontaktName(k),
      kundennummer: k?.kundennummer ?? "",
      lexwareKontaktId: k?.lexware_contact_id ?? null,
      leitwegId: k?.leitweg_id ?? "",
    },
    angebot: r.quotes ? { id: r.quotes.id, betreff: r.quotes.betreff } : null,
  };
}

export type RechnungListenZeile = {
  id: string;
  betreff: string;
  rechnungsdatum: string;
  status: RechnungStatus;
  rechnungsnummer: string;
  lexwareStatus: string;
  netto: number;
  brutto: number;
  archiviert: boolean;
  projektId: string;
  projektnummer: string;
  projektName: string;
  kunde: string;
  zahlungszielTage: number | null;
  abgeglichenAm: string | null;
  mahnstufe: number;
};

export const MAX_RECHNUNGEN = 300;

/** Rechnungsliste (neueste zuerst). Suche über Betreff, Rechnungsnummer, Projekt, Projektnummer und Kunde. */
export async function rechnungenLaden(opts: {
  q?: string;
  status?: RechnungStatus | "";
  archiv?: boolean;
  projektId?: string;
  /** Höchstzahl der Zeilen; die Listenseite filtert danach noch selbst und lädt deshalb alle (1000) */
  limit?: number;
}): Promise<{ zeilen: RechnungListenZeile[]; gesamt: number }> {
  const supabase = await createClient();
  let abfrage = supabase
    .from("invoices")
    .select(
      "id, project_id, betreff, rechnungsdatum, status, rechnungsnummer, lexware_status, zahlungsziel_tage, abgeglichen_am, mahnstufe, steuersatz, reverse_charge, rabatt_prozent, netto, brutto, archiviert_am, created_at, projects(name, projektnummer), contacts(firmenname, vorname, nachname), invoice_items(typ, kurztext, langtext, menge, einheit, einzelpreis)",
    );
  abfrage = opts.archiv ? abfrage.not("archiviert_am", "is", null) : abfrage.is("archiviert_am", null);
  if (opts.status) abfrage = abfrage.eq("status", opts.status);
  if (opts.projektId) abfrage = abfrage.eq("project_id", opts.projektId);
  const { data, error } = await abfrage.order("rechnungsdatum", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error("Die Rechnungen konnten nicht geladen werden.");

  const zeilen: RechnungListenZeile[] = data.map((r) => {
    const rechnung = rechnungBerechnen(
      (r.invoice_items ?? []).map((i) => ({
        typ: i.typ, kurztext: i.kurztext ?? "", langtext: i.langtext ?? "",
        menge: i.menge == null ? null : Number(i.menge), einheit: i.einheit ?? "", einzelpreis: i.einzelpreis == null ? null : Number(i.einzelpreis),
      })),
      { rabattProzent: Number(r.rabatt_prozent), steuersatz: Number(r.steuersatz), reverseCharge: r.reverse_charge },
    );
    return {
      id: r.id,
      betreff: r.betreff,
      rechnungsdatum: r.rechnungsdatum,
      status: r.status,
      rechnungsnummer: r.rechnungsnummer ?? "",
      lexwareStatus: r.lexware_status ?? "",
      // Nach der Übertragung gilt der Betrag, den Lexware zurückgemeldet hat
      netto: r.netto == null ? rechnung.nettoNachRabatt : Number(r.netto),
      brutto: r.brutto == null ? rechnung.brutto : Number(r.brutto),
      archiviert: r.archiviert_am != null,
      projektId: r.project_id,
      projektnummer: r.projects?.projektnummer ?? "",
      projektName: r.projects?.name ?? "",
      kunde: kontaktName(r.contacts),
      zahlungszielTage: r.zahlungsziel_tage,
      abgeglichenAm: r.abgeglichen_am,
      mahnstufe: r.mahnstufe,
    };
  });

  const suche = suchtext(opts.q ?? "").toLowerCase();
  const gefiltert = suche
    ? zeilen.filter((z) => [z.betreff, z.rechnungsnummer, z.projektName, z.projektnummer, z.kunde].some((t) => t.toLowerCase().includes(suche)))
    : zeilen;
  return { zeilen: gefiltert.slice(0, opts.limit ?? MAX_RECHNUNGEN), gesamt: gefiltert.length };
}
