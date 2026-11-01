import "server-only";
import { briefanschrift } from "@/lib/kontakt-schema";
import { kontaktName, adresseText } from "@/lib/projekt";
import { istRechnungsArt, rechnungBerechnen, type RechnungStatus, type RechnungsArt, type RechnungsBaustein } from "@/lib/rechnung";
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
  /** „eigen“ = Rechnung der App; „aelter“ = übernommene Rechnung aus einem früheren System (fertig, gesperrt, nur lesbar, bezahlbar, mahnbar) */
  anbieter: "eigen" | "aelter";
  versendetAm: string | null;
  versendetAn: string | null;
  bezahltAm: string | null;
  storniertAm: string | null;
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
  notiz: string;
  /** Rechnungsart (normale Rechnung, Abschlag, Schluss, Gutschrift, Storno) */
  art: RechnungsArt;
  /** Bei Gutschrift und Storno: die Rechnung, auf die sich das Dokument bezieht */
  bezugId: string | null;
  bezugNummer: string;
  bezugDatum: string | null;
  /** Schlussrechnung: abgezogene Abschlagsrechnungen (Summen); netto/brutto sind dann der Zahlbetrag */
  abzugNetto: number;
  abzugBrutto: number;
};

/** Abgezogene (Schlussrechnung fertig) bzw. noch abzuziehende (Entwurf) Abschlagsrechnung. */
export type AbschlagZeile = { id: string; nummer: string; datum: string; netto: number; brutto: number };

/** Gutschriften und Stornos, die sich auf diese Rechnung beziehen. */
export type FolgeDokument = { id: string; art: RechnungsArt; nummer: string; datum: string; brutto: number };

export type RechnungDetail = {
  rechnung: RechnungKopf;
  bausteine: (RechnungsBaustein & { id: string })[];
  projekt: { id: string; name: string; projektnummer: string; adresse: string };
  kunde: { id: string; name: string; kundennummer: string; email: string; leitwegId: string; anschrift: string[]; strasse: string; plz: string; ort: string; land: string };
  mahnungen: { id: string; stufe: number; versendetAn: string | null; versendetAm: string | null; erstelltAm: string }[];
  angebot: { id: string; betreff: string } | null;
  abschlaege: AbschlagZeile[];
  folgedokumente: FolgeDokument[];
};

export async function rechnungLaden(id: string): Promise<RechnungDetail | null> {
  const supabase = await createClient();
  const { data: r, error } = await supabase
    .from("invoices")
    .select(
      "id, project_id, quote_id, contact_id, status, betreff, rechnungsdatum, leistung_von, leistung_bis, zahlungsziel_tage, skonto_prozent, skonto_tage, steuersatz, reverse_charge, rabatt_prozent, einleitung, schlusstext, anbieter, lexware_id, sevdesk_id, versendet_am, versendet_an, bezahlt_am, storniert_am, rechnungsnummer, lexware_status, netto, brutto, uebertragen_am, abgeglichen_am, pdf_pfad, archiviert_am, mahnstufe, angemahnt_am, notiz, art, bezug_id, abzug_netto, abzug_brutto, projects(id, name, projektnummer, baustelle_strasse, baustelle_plz, baustelle_ort), contacts(id, kundennummer, typ, anrede, firmenname, ansprechpartner, vorname, nachname, strasse, plz, ort, land, empfaenger, email, lexware_contact_id, sevdesk_contact_id, leitweg_id), quotes(id, betreff)",
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

  const { data: mahn } = await supabase
    .from("invoice_reminders")
    .select("id, stufe, versendet_an, versendet_am, created_at")
    .eq("invoice_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Bezug (Gutschrift/Storno), abgezogene bzw. noch abzuziehende Abschläge und Folgedokumente
  let bezugNummer = "";
  let bezugDatum: string | null = null;
  if (r.bezug_id) {
    const { data: b } = await supabase.from("invoices").select("rechnungsnummer, rechnungsdatum").eq("id", r.bezug_id).maybeSingle();
    bezugNummer = b?.rechnungsnummer ?? "";
    bezugDatum = b?.rechnungsdatum ?? null;
  }
  let abschlaege: AbschlagZeile[] = [];
  if (r.art === "schluss") {
    if (r.status === "uebertragen") {
      const { data: z } = await supabase.from("invoice_abschlaege").select("abschlag_id, netto, brutto").eq("invoice_id", id);
      const ids = (z ?? []).map((x) => x.abschlag_id);
      const { data: a } = ids.length ? await supabase.from("invoices").select("id, rechnungsnummer, rechnungsdatum").in("id", ids) : { data: [] };
      abschlaege = (z ?? []).map((x) => {
        const q = (a ?? []).find((y) => y.id === x.abschlag_id);
        return { id: x.abschlag_id, nummer: q?.rechnungsnummer ?? "", datum: q?.rechnungsdatum ?? "", netto: Number(x.netto), brutto: Number(x.brutto) };
      });
    } else if (r.quote_id) {
      const { data: a } = await supabase
        .from("invoices")
        .select("id, rechnungsnummer, rechnungsdatum, netto, brutto")
        .eq("quote_id", r.quote_id).eq("art", "abschlag").eq("status", "uebertragen").eq("anbieter", "eigen").neq("lexware_status", "voided");
      abschlaege = (a ?? []).map((q) => ({ id: q.id, nummer: q.rechnungsnummer ?? "", datum: q.rechnungsdatum, netto: Number(q.netto ?? 0), brutto: Number(q.brutto ?? 0) }));
    }
    abschlaege.sort((x, y) => x.datum.localeCompare(y.datum) || x.nummer.localeCompare(y.nummer));
  }
  const { data: folge } = await supabase
    .from("invoices")
    .select("id, art, rechnungsnummer, rechnungsdatum, brutto")
    .eq("bezug_id", id)
    .eq("status", "uebertragen")
    .order("rechnungsdatum");
  const folgedokumente: FolgeDokument[] = (folge ?? []).map((f) => ({ id: f.id, art: istRechnungsArt(f.art) ? f.art : "gutschrift", nummer: f.rechnungsnummer ?? "", datum: f.rechnungsdatum, brutto: Number(f.brutto ?? 0) }));

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
      anbieter: r.anbieter === "eigen" ? "eigen" : "aelter",
      versendetAm: r.versendet_am,
      versendetAn: r.versendet_an,
      bezahltAm: r.bezahlt_am,
      storniertAm: r.storniert_am,
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
      notiz: r.notiz ?? "",
      art: istRechnungsArt(r.art) ? r.art : "rechnung",
      bezugId: r.bezug_id,
      bezugNummer,
      bezugDatum,
      abzugNetto: Number(r.abzug_netto ?? 0),
      abzugBrutto: Number(r.abzug_brutto ?? 0),
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
      email: k?.email ?? "",
      leitwegId: k?.leitweg_id ?? "",
      anschrift: k ? briefanschrift(k) : [],
      strasse: k?.strasse ?? "",
      plz: k?.plz ?? "",
      ort: k?.ort ?? "",
      land: k?.land ?? "",
    },
    angebot: r.quotes ? { id: r.quotes.id, betreff: r.quotes.betreff } : null,
    abschlaege,
    folgedokumente,
    mahnungen: (mahn ?? []).map((m) => ({ id: m.id, stufe: m.stufe, versendetAn: m.versendet_an, versendetAm: m.versendet_am, erstelltAm: m.created_at })),
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
  /** Pfad der Datei der Buchhaltung im Speicher (PDF, bei XRechnung XML), leer = noch keine Datei */
  pdfPfad: string | null;
  /** Die Datei ist ein PDF (bei XRechnung ist sie XML und lässt sich nicht anzeigen) */
  hatPdf: boolean;
  /** Die Datei ist eine XRechnung (XML) */
  hatXml: boolean;
  anbieter: "eigen" | "aelter";
  art: RechnungsArt;
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
      "id, project_id, betreff, rechnungsdatum, status, rechnungsnummer, lexware_status, zahlungsziel_tage, abgeglichen_am, pdf_pfad, anbieter, lexware_id, mahnstufe, steuersatz, reverse_charge, rabatt_prozent, netto, brutto, art, archiviert_am, created_at, projects(name, projektnummer), contacts(firmenname, vorname, nachname), invoice_items(typ, kurztext, langtext, menge, einheit, einzelpreis)",
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
      // Nach dem Fertigstellen gelten die festgeschriebenen Beträge
      netto: r.netto == null ? (r.art === "gutschrift" || r.art === "storno" ? -rechnung.nettoNachRabatt : rechnung.nettoNachRabatt) : Number(r.netto),
      brutto: r.brutto == null ? (r.art === "gutschrift" || r.art === "storno" ? -rechnung.brutto : rechnung.brutto) : Number(r.brutto),
      archiviert: r.archiviert_am != null,
      projektId: r.project_id,
      projektnummer: r.projects?.projektnummer ?? "",
      projektName: r.projects?.name ?? "",
      kunde: kontaktName(r.contacts),
      zahlungszielTage: r.zahlungsziel_tage,
      abgeglichenAm: r.abgeglichen_am,
      mahnstufe: r.mahnstufe,
      pdfPfad: r.pdf_pfad,
      hatPdf: Boolean(r.pdf_pfad) && !r.pdf_pfad!.endsWith(".xml"),
      hatXml: Boolean(r.pdf_pfad) && r.pdf_pfad!.endsWith(".xml"),
      anbieter: r.anbieter === "eigen" ? "eigen" : "aelter",
      art: istRechnungsArt(r.art) ? r.art : "rechnung",
    };
  });

  const suche = suchtext(opts.q ?? "").toLowerCase();
  const gefiltert = suche
    ? zeilen.filter((z) => [z.betreff, z.rechnungsnummer, z.projektName, z.projektnummer, z.kunde].some((t) => t.toLowerCase().includes(suche)))
    : zeilen;
  return { zeilen: gefiltert.slice(0, opts.limit ?? MAX_RECHNUNGEN), gesamt: gefiltert.length };
}
