import "server-only";
import { pdfDateiname } from "@/lib/angebot-pdf-daten";
import { angebotPdf } from "@/lib/angebot-pdf";
import { angebotEinstellungenLaden, firmaLaden } from "@/lib/firma-daten";
import { lohnanteilBerechnen, lohnanteilText, lohnanteilZeigen } from "@/lib/lohnanteil";
import { RECHNUNGS_ART_NAMEN, istGutschriftArt, rechnungBerechnen } from "@/lib/rechnung";
import { zahlungsbedingungText } from "@/lib/rechnung";
import { rechnungLaden } from "@/lib/rechnung-daten";
import { AUFBEWAHRUNG_PRIVAT_HINWEIS, faelligkeitsDatum } from "@/lib/rechnung-eigen";
import { rechnungsEinstellungenLaden } from "@/lib/rechnung-einstellungen-daten";
import { createClient } from "@/lib/supabase/server";

/**
 * PDF einer eigenen Rechnung (Firmendaten, Logo und Texte aus den Einstellungen). Nur für Rechnungen mit Nummer.
 * Wer das aufruft, hat vorher requireBueroRecht("rechnungen") geprüft. null = Rechnung gibt es nicht oder sie hat noch keine Nummer.
 */
export async function rechnungPdfErzeugen(id: string): Promise<{ bytes: Uint8Array; dateiname: string } | null> {
  const detail = await rechnungLaden(id);
  if (!detail || !detail.rechnung.rechnungsnummer) return null;
  const { rechnung: r, bausteine, projekt, kunde } = detail;

  const [firma, vorgaben, einst] = await Promise.all([firmaLaden(), angebotEinstellungenLaden(), rechnungsEinstellungenLaden()]);
  const supabase = await createClient();
  let logo: Uint8Array | undefined;
  if (firma.logo && vorgaben.logo_anzeigen) {
    const { data } = await supabase.storage.from("firmenlogo").download(firma.logo);
    if (data) logo = new Uint8Array(await data.arrayBuffer());
  }

  // Lohnkosten (§ 35a EStG) nach Einstellung; bei der Schlussrechnung den Lohn abziehen, der schon mit den Abschlägen ausgewiesen wurde
  const steuer = { rabattProzent: r.rabattProzent, steuersatz: r.steuersatz, reverseCharge: r.reverseCharge };
  let lohnHinweis: string | undefined;
  if (!istGutschriftArt(r.art) && lohnanteilZeigen(einst, kunde.typ)) {
    let abschlaegeLohn = 0;
    if (detail.abschlaege.length) {
      const { data: items } = await supabase.from("invoice_items").select("typ, menge, einzelpreis, lohn_einzel").in("invoice_id", detail.abschlaege.map((a) => a.id));
      abschlaegeLohn = lohnanteilBerechnen(
        (items ?? []).map((i) => ({ typ: i.typ, kurztext: "", langtext: "", einheit: "", menge: i.menge == null ? null : Number(i.menge), einzelpreis: i.einzelpreis == null ? null : Number(i.einzelpreis), lohnEinzel: i.lohn_einzel == null ? null : Number(i.lohn_einzel) })),
        { ...steuer, rabattProzent: 0 },
      ).brutto;
    }
    lohnHinweis = lohnanteilText(lohnanteilBerechnen(bausteine, steuer), abschlaegeLohn) ?? undefined;
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
    berechnung: rechnungBerechnen(bausteine, steuer),
    reverseChargeText: vorgaben.reverse_charge_text,
    bilder: {},
    logo,
    zahlungsbedingung: istGutschriftArt(r.art) ? "" : zahlungsbedingungText(r.zahlungszielTage, r.skontoProzent, r.skontoTage),
    rechnung: {
      nummer: r.rechnungsnummer,
      leistungVon: r.leistungVon,
      leistungBis: r.leistungBis,
      faelligAm: faelligkeitsDatum(r.rechnungsdatum, r.zahlungszielTage),
      art: r.art,
      bezug: r.bezugId && r.bezugNummer && r.bezugDatum ? { nummer: r.bezugNummer, datum: r.bezugDatum } : undefined,
      abschlaege: detail.abschlaege.length ? detail.abschlaege : undefined,
      zahlbetrag: detail.abschlaege.length && r.brutto !== null ? r.brutto : undefined,
      lohnHinweis,
      // Pflichthinweis bei Leistungen am Grundstück an Privatpersonen (§ 14 Abs. 4 Nr. 9 UStG)
      aufbewahrungHinweis: kunde.typ === "firma" ? undefined : AUFBEWAHRUNG_PRIVAT_HINWEIS,
      // USt-IdNr. des Kunden unter der Anschrift, wenn eingetragen (Pflicht für die E-Rechnung bei Reverse-Charge, Plancraft druckt sie auch)
      kundeUstId: kunde.ustId || undefined,
    },
  });
  return { bytes, dateiname: pdfDateiname(r.rechnungsnummer, RECHNUNGS_ART_NAMEN[r.art]) };
}
