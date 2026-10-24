import "server-only";
import { pdfDateiname } from "@/lib/angebot-pdf-daten";
import { angebotPdf } from "@/lib/angebot-pdf";
import { angebotEinstellungenLaden, firmaLaden } from "@/lib/firma-daten";
import { RECHNUNGS_ART_NAMEN, rechnungBerechnen, zahlungsbedingungText } from "@/lib/rechnung";
import { rechnungLaden } from "@/lib/rechnung-daten";
import { faelligkeitsDatum } from "@/lib/rechnung-eigen";
import { createClient } from "@/lib/supabase/server";

/**
 * PDF einer eigenen Rechnung (Firmendaten, Logo und Texte aus den Einstellungen). Nur für Rechnungen mit Nummer.
 * Wer das aufruft, hat vorher requireBueroRecht("rechnungen") geprüft. null = Rechnung gibt es nicht oder sie hat noch keine Nummer.
 */
export async function rechnungPdfErzeugen(id: string): Promise<{ bytes: Uint8Array; dateiname: string } | null> {
  const detail = await rechnungLaden(id);
  if (!detail || !detail.rechnung.rechnungsnummer) return null;
  const { rechnung: r, bausteine, projekt, kunde } = detail;

  const [firma, vorgaben] = await Promise.all([firmaLaden(), angebotEinstellungenLaden()]);
  let logo: Uint8Array | undefined;
  if (firma.logo && vorgaben.logo_anzeigen) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("firmenlogo").download(firma.logo);
    if (data) logo = new Uint8Array(await data.arrayBuffer());
  }

  const bytes = await angebotPdf({
    firma,
    status: "versendet",
    datum: r.rechnungsdatum,
    betreff: r.betreff,
    leistungsort: projekt.adresse,
    empfaenger: kunde.anschrift.length ? kunde.anschrift.join("\n") : kunde.name,
    einleitung: r.einleitung,
    schlusstext: r.schlusstext,
    kundennummer: kunde.kundennummer,
    projektnummer: projekt.projektnummer,
    berechnung: rechnungBerechnen(bausteine, { rabattProzent: r.rabattProzent, steuersatz: r.steuersatz, reverseCharge: r.reverseCharge }),
    reverseChargeText: vorgaben.reverse_charge_text,
    bilder: {},
    logo,
    zahlungsbedingung: r.art === "gutschrift" || r.art === "storno" ? "" : zahlungsbedingungText(r.zahlungszielTage, r.skontoProzent, r.skontoTage),
    rechnung: {
      nummer: r.rechnungsnummer,
      leistungVon: r.leistungVon,
      leistungBis: r.leistungBis,
      faelligAm: faelligkeitsDatum(r.rechnungsdatum, r.zahlungszielTage),
      art: r.art,
      bezug: r.bezugId && r.bezugNummer && r.bezugDatum ? { nummer: r.bezugNummer, datum: r.bezugDatum } : undefined,
      abschlaege: detail.abschlaege.length ? detail.abschlaege : undefined,
      zahlbetrag: detail.abschlaege.length && r.brutto !== null ? r.brutto : undefined,
    },
  });
  return { bytes, dateiname: pdfDateiname(r.rechnungsnummer, RECHNUNGS_ART_NAMEN[r.art]) };
}
