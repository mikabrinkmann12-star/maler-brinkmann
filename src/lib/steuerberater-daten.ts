import "server-only";
import { istRechnungsArt } from "@/lib/rechnung";
import { kontaktName } from "@/lib/projekt";
import { datevAusJson, type DatevEinstellungen, type DebitorStamm, type JournalZeile } from "@/lib/steuerberater-export";
import { createClient } from "@/lib/supabase/server";

// Abfragen für den Steuerberater-Export (nur Büro/Admin, die Datenbank erzwingt es per RLS). Wer sie aufruft, hat vorher requireBueroRecht("rechnungen") geprüft.

export type ExportRechnung = JournalZeile & { id: string; pdfPfad: string | null };

/** Alle fertigen Rechnungen, Gutschriften und Stornos mit Rechnungsdatum im Zeitraum (nicht archivierte), sortiert nach Datum und Nummer. */
export async function exportRechnungenLaden(zeitraum: { von: string; bis: string }): Promise<ExportRechnung[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, rechnungsnummer, art, rechnungsdatum, leistung_von, leistung_bis, betreff, netto, brutto, steuersatz, reverse_charge, lexware_status, bezahlt_am, bezug_id, abzug_brutto, anbieter, pdf_pfad, projects(projektnummer), contacts(kundennummer, firmenname, vorname, nachname, debitorennummer)",
    )
    .eq("status", "uebertragen")
    .is("archiviert_am", null)
    .gte("rechnungsdatum", zeitraum.von)
    .lte("rechnungsdatum", zeitraum.bis)
    .not("rechnungsnummer", "is", null)
    .order("rechnungsdatum")
    .order("rechnungsnummer")
    .limit(2000);
  if (error) throw new Error("Die Rechnungen konnten nicht geladen werden.");

  const bezugIds = [...new Set((data ?? []).map((r) => r.bezug_id).filter((x): x is string => Boolean(x)))];
  const { data: bezuege } = bezugIds.length ? await supabase.from("invoices").select("id, rechnungsnummer").in("id", bezugIds) : { data: [] };
  const bezugNr = new Map((bezuege ?? []).map((b) => [b.id, b.rechnungsnummer ?? ""]));

  return (data ?? []).map((r) => ({
    id: r.id,
    pdfPfad: r.pdf_pfad,
    nummer: r.rechnungsnummer ?? "",
    art: istRechnungsArt(r.art) ? r.art : "rechnung",
    datum: r.rechnungsdatum,
    leistungVon: r.leistung_von,
    leistungBis: r.leistung_bis,
    kunde: kontaktName(r.contacts),
    kundennummer: r.contacts?.kundennummer ?? "",
    projektnummer: r.projects?.projektnummer ?? "",
    betreff: r.betreff,
    netto: Number(r.netto ?? 0),
    brutto: Number(r.brutto ?? 0),
    steuersatz: Number(r.steuersatz),
    reverseCharge: r.reverse_charge,
    status: r.lexware_status === "paid" ? "bezahlt" : r.lexware_status === "voided" ? "storniert" : "offen",
    bezahltAm: r.bezahlt_am,
    bezugNummer: r.bezug_id ? (bezugNr.get(r.bezug_id) ?? "") : "",
    abzugBrutto: Number(r.abzug_brutto ?? 0),
    anbieter: r.anbieter === "eigen" ? "eigen" : "aelter",
    debitor: r.contacts?.debitorennummer ?? null,
  }));
}

/** Alle Kunden mit eigenem Konto (Debitor) für die DATEV-Kundenliste, auch archivierte (ihre Buchungen brauchen das Konto weiter). */
export async function debitorenLaden(): Promise<DebitorStamm[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("debitorennummer, typ, firmenname, vorname, nachname, kundennummer, strasse, plz, ort, land, ust_id")
    .not("debitorennummer", "is", null)
    .order("debitorennummer")
    .limit(10000);
  if (error) throw new Error("Die Kunden konnten nicht geladen werden.");
  return (data ?? []).map((k) => ({
    debitor: k.debitorennummer as number,
    firma: k.typ === "firma",
    firmenname: k.firmenname ?? "",
    vorname: k.vorname ?? "",
    nachname: k.nachname ?? "",
    kundennummer: k.kundennummer ?? "",
    strasse: k.strasse ?? "",
    plz: k.plz ?? "",
    ort: k.ort ?? "",
    land: k.land ?? "",
    ustId: k.ust_id ?? "",
  }));
}

/** Konten und Nummern für den DATEV-Export (Einstellung „datev“). */
export async function datevEinstellungenLaden(): Promise<DatevEinstellungen> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("wert").eq("schluessel", "datev").maybeSingle();
  return datevAusJson(data?.wert);
}
