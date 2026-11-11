import "server-only";
import { AFRelationship, PDFDocument } from "pdf-lib";
import { eRechnungErzeugen, type ERechnung } from "@/lib/e-rechnung";
import { angebotEinstellungenLaden, firmaLaden } from "@/lib/firma-daten";
import { RECHNUNGS_ART_NAMEN, rechnungBerechnen, zahlungsbedingungText } from "@/lib/rechnung";
import { rechnungLaden } from "@/lib/rechnung-daten";
import { faelligkeitsDatum } from "@/lib/rechnung-eigen";
import { createClient } from "@/lib/supabase/server";

// E-Rechnung zu einer fertigen Rechnung der App: XML (CII, EN 16931) und ein PDF mit eingebettetem XML.
// Wer das aufruft, hat vorher requireBueroRecht("rechnungen") geprüft. Das XML entsteht jedes Mal aus den festgeschriebenen Daten (sie ändern sich nicht mehr).

/** Die strukturierte Rechnung samt Warnungen; null = Rechnung nicht da, noch nicht fertig oder nicht von der App. */
export async function eRechnungFuer(id: string): Promise<(ERechnung & { dateiname: string; nummer: string }) | null> {
  const detail = await rechnungLaden(id);
  if (!detail || detail.rechnung.anbieter !== "eigen" || detail.rechnung.status !== "uebertragen" || !detail.rechnung.rechnungsnummer) return null;
  const { rechnung: r, bausteine, kunde } = detail;
  const [firma, vorgaben] = await Promise.all([firmaLaden(), angebotEinstellungenLaden()]);
  const e = eRechnungErzeugen({
    art: r.art,
    nummer: r.rechnungsnummer,
    datum: r.rechnungsdatum,
    leistungVon: r.leistungVon,
    leistungBis: r.leistungBis,
    faelligAm: faelligkeitsDatum(r.rechnungsdatum, r.zahlungszielTage),
    betreff: r.betreff,
    zahlungsbedingung: r.art === "gutschrift" || r.art === "storno" ? "" : zahlungsbedingungText(r.zahlungszielTage, r.skontoProzent, r.skontoTage),
    verkaeufer: firma,
    kaeufer: { name: kunde.name, strasse: kunde.strasse, plz: kunde.plz, ort: kunde.ort, land: kunde.land, email: kunde.email, leitwegId: kunde.leitwegId, ustId: kunde.ustId },
    berechnung: rechnungBerechnen(bausteine, { rabattProzent: r.rabattProzent, steuersatz: r.steuersatz, reverseCharge: r.reverseCharge }),
    reverseChargeText: vorgaben.reverse_charge_text,
    bezug: r.bezugId && r.bezugNummer && r.bezugDatum ? { nummer: r.bezugNummer, datum: r.bezugDatum } : undefined,
    abzugBrutto: r.abzugBrutto,
  });
  return { ...e, nummer: r.rechnungsnummer, dateiname: `${RECHNUNGS_ART_NAMEN[r.art]}_${r.rechnungsnummer}` };
}

/**
 * Das gespeicherte Rechnungs-PDF mit dem XML als Anhang „factur-x.xml“ (ZUGFeRD/Factur-X). Das PDF selbst bleibt unverändert;
 * es ist aber kein zertifiziertes PDF/A-3 (keine Farbprofile und keine Factur-X-Metadaten), Lesegeräte finden den Anhang meist trotzdem.
 */
export async function pdfMitXml(pdfBytes: Uint8Array, xml: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const jetzt = new Date();
  await doc.attach(new TextEncoder().encode(xml), "factur-x.xml", {
    mimeType: "text/xml",
    description: "Factur-X Rechnung (EN 16931)",
    creationDate: jetzt,
    modificationDate: jetzt,
    afRelationship: AFRelationship.Alternative,
  });
  // Ohne Objektströme, damit Dateiname und Anhangsbeziehung im Klartext stehen (Lesegeräte für ZUGFeRD finden den Anhang so zuverlässiger)
  return doc.save({ useObjectStreams: false });
}

/** Gespeichertes PDF der Rechnung aus dem Speicher holen; null = keins vorhanden. */
export async function gespeichertesPdf(pfad: string | null): Promise<Uint8Array | null> {
  if (!pfad || pfad.endsWith(".xml")) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("rechnungen").download(pfad);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}
