// E-Rechnung für die eigenen Rechnungen der App: erzeugt aus den (festgeschriebenen) Rechnungsdaten die strukturierte Rechnung im Format
// „UN/CEFACT Cross Industry Invoice“ (CII) nach EN 16931. Das ist die Syntax von ZUGFeRD/Factur-X und eine der beiden Syntaxen der XRechnung.
//
// WICHTIG: Der Aufbau ist nach der Norm (Reihenfolge der Elemente, Pflichtfelder, Summenregeln) gebaut und mit Tests auf Aufbau und Summen geprüft,
// aber NICHT mit dem amtlichen Prüfprogramm (KoSIT-Validator) geprüft. Vor dem Einsatz bei Behörden bzw. ab Pflicht 2028 muss das mit dem Prüfer und
// dem Steuerberater nachgeholt werden. Das PDF mit eingebettetem XML ist KEIN zertifiziertes PDF/A-3 (siehe e-rechnung-pdf.ts).
// Reine Logik, auch im Browser nutzbar.

import type { Berechnung } from "@/lib/angebot";
import type { Firma } from "@/lib/firma";
import type { RechnungsArt } from "@/lib/rechnung";

export type ERechnungKaeufer = {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  /** Landesname wie im Kontakt („Deutschland“) */
  land: string;
  email: string;
  leitwegId: string;
};

export type ERechnungDaten = {
  art: RechnungsArt;
  nummer: string;
  /** JJJJ-MM-TT */
  datum: string;
  leistungVon: string;
  leistungBis: string;
  faelligAm: string;
  betreff: string;
  zahlungsbedingung: string;
  verkaeufer: Firma;
  kaeufer: ERechnungKaeufer;
  /** Berechnung aus den Positionen (Mengen und Preise positiv, auch bei Gutschrift und Storno) */
  berechnung: Berechnung;
  reverseChargeText: string;
  /** Gutschrift und Storno: die Rechnung, auf die sie sich beziehen */
  bezug?: { nummer: string; datum: string };
  /** Schlussrechnung: bereits bezahlte Abschläge (brutto) */
  abzugBrutto: number;
};

export type ERechnung = {
  xml: string;
  /** „xrechnung“ (Behörden, mit Leitweg-ID) oder „en16931“ (ZUGFeRD/Factur-X für Firmen und Private) */
  profil: "xrechnung" | "en16931";
  /** Dinge, die nach der Norm fehlen oder unsicher sind; die Rechnung wird trotzdem erzeugt */
  warnungen: string[];
};

const LAENDER: Record<string, string> = {
  deutschland: "DE", germany: "DE", österreich: "AT", oesterreich: "AT", austria: "AT", schweiz: "CH", niederlande: "NL", belgien: "BE",
  luxemburg: "LU", frankreich: "FR", polen: "PL", dänemark: "DK", daenemark: "DK", italien: "IT", spanien: "ES", tschechien: "CZ",
};

export function laenderCode(land: string): string | null {
  const t = land.trim();
  if (!t) return "DE";
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return LAENDER[t.toLowerCase()] ?? null;
}

/** Einheit der Position → Code der UN/ECE-Empfehlung 20. Unbekanntes wird zu „C62“ (Stück/Einheit). */
export function einheitenCode(einheit: string): string {
  const e = einheit.trim().toLowerCase().replace(/\./g, "");
  const karte: Record<string, string> = {
    "m²": "MTK", m2: "MTK", qm: "MTK", "m³": "MTQ", m3: "MTQ", m: "MTR", lfm: "MTR", km: "KMT",
    std: "HUR", h: "HUR", stunde: "HUR", stunden: "HUR", min: "MIN", tag: "DAY", tage: "DAY",
    kg: "KGM", t: "TNE", l: "LTR", liter: "LTR", ml: "MLT", stk: "C62", stück: "C62", psch: "C62", pauschal: "C62",
  };
  return karte[e] ?? "C62";
}

const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const betrag = (w: number): string => (Math.round(w * 100) / 100).toFixed(2);
const menge = (w: number): string => String(Math.round(w * 1000) / 1000);
const datum = (iso: string): string => iso.replace(/-/g, "");
const tag = (name: string, inhalt: string, attr = ""): string => `<${name}${attr}>${inhalt}</${name}>`;
const d102 = (name: string, iso: string): string => `<${name}><udt:DateTimeString format="102">${datum(iso)}</udt:DateTimeString></${name}>`;

/** Typ der Rechnung nach UNTDID 1001: 380 Rechnung, 386 Abschlagsrechnung, 381 Gutschrift (auch Storno). */
export function rechnungsTypCode(art: RechnungsArt): "380" | "381" | "386" {
  return art === "gutschrift" || art === "storno" ? "381" : art === "abschlag" ? "386" : "380";
}

export function eRechnungErzeugen(d: ERechnungDaten): ERechnung {
  const warnungen: string[] = [];
  const f = d.verkaeufer;
  const k = d.kaeufer;
  const b = d.berechnung;
  const landCode = laenderCode(k.land);
  if (landCode === null) warnungen.push(`Das Land des Kunden („${k.land}“) ist unbekannt; als Deutschland eingetragen.`);
  const xrechnung = Boolean(k.leitwegId.trim());

  if (!f.ustid.trim() && !f.steuernummer.trim()) warnungen.push("Weder USt-IdNr. noch Steuernummer der Firma sind eingetragen.");
  if (!f.email.trim()) warnungen.push("Die E-Mail-Adresse der Firma fehlt (Pflicht bei der XRechnung).");
  if (!f.telefon.trim()) warnungen.push("Die Telefonnummer der Firma fehlt (Pflicht bei der XRechnung).");
  if (!f.iban.trim()) warnungen.push("Die IBAN der Firma fehlt (Zahlungsangabe).");
  if (!k.email.trim()) warnungen.push("Die E-Mail-Adresse des Kunden fehlt (Pflicht bei der XRechnung).");
  if (!k.strasse.trim() || !k.plz.trim() || !k.ort.trim()) warnungen.push("Die Anschrift des Kunden ist unvollständig (Straße, PLZ, Ort).");
  if (b.reverseCharge) warnungen.push("Reverse-Charge: Die USt-IdNr. des Kunden fehlt in der App, die Norm verlangt sie (Kategorie AE).");

  const typ = rechnungsTypCode(d.art);
  const kategorie = b.reverseCharge ? "AE" : b.steuersatz > 0 ? "S" : "Z";
  const satz = b.reverseCharge ? 0 : b.steuersatz;
  const steuerBlock = (basis = "") => `<ram:TypeCode>VAT</ram:TypeCode>${basis}<ram:CategoryCode>${kategorie}</ram:CategoryCode><ram:RateApplicablePercent>${satz}</ram:RateApplicablePercent>`;

  // Positionen (nur echte Positionen, Titel und Texte sind keine Rechnungszeilen)
  const zeilen = b.zeilen.filter((z) => z.baustein.typ === "position");
  const posXml = zeilen
    .map((z, i) => {
      const p = z.baustein;
      const name = (p.kurztext.trim() || p.langtext.trim().split("\n")[0] || "Position").slice(0, 200);
      const beschr = p.kurztext.trim() && p.langtext.trim() ? tag("ram:Description", esc(p.langtext.trim().slice(0, 1000))) : "";
      return (
        "<ram:IncludedSupplyChainTradeLineItem>" +
        tag("ram:AssociatedDocumentLineDocument", tag("ram:LineID", String(i + 1))) +
        tag("ram:SpecifiedTradeProduct", tag("ram:Name", esc(name)) + beschr) +
        tag("ram:SpecifiedLineTradeAgreement", tag("ram:NetPriceProductTradePrice", tag("ram:ChargeAmount", betrag(p.einzelpreis ?? 0)))) +
        tag("ram:SpecifiedLineTradeDelivery", tag("ram:BilledQuantity", menge(p.menge ?? 0), ` unitCode="${einheitenCode(p.einheit)}"`)) +
        tag(
          "ram:SpecifiedLineTradeSettlement",
          tag("ram:ApplicableTradeTax", steuerBlock()) + tag("ram:SpecifiedTradeSettlementLineMonetarySummation", tag("ram:LineTotalAmount", betrag(z.gesamt ?? 0))),
        ) +
        "</ram:IncludedSupplyChainTradeLineItem>"
      );
    })
    .join("");

  const anschrift = (strasse: string, plz: string, ort: string, land: string) =>
    tag("ram:PostalTradeAddress", tag("ram:PostcodeCode", esc(plz)) + tag("ram:LineOne", esc(strasse)) + tag("ram:CityName", esc(ort)) + tag("ram:CountryID", land));

  const verkaeuferXml = tag(
    "ram:SellerTradeParty",
    tag("ram:Name", esc(f.name)) +
      tag(
        "ram:DefinedTradeContact",
        tag("ram:PersonName", esc(f.inhaber.trim() || f.name)) +
          (f.telefon.trim() ? tag("ram:TelephoneUniversalCommunication", tag("ram:CompleteNumber", esc(f.telefon.trim()))) : "") +
          (f.email.trim() ? tag("ram:EmailURIUniversalCommunication", tag("ram:URIID", esc(f.email.trim()))) : ""),
      ) +
      anschrift(f.strasse, f.plz, f.ort, "DE") +
      (f.email.trim() ? tag("ram:URIUniversalCommunication", tag("ram:URIID", esc(f.email.trim()), ` schemeID="EM"`)) : "") +
      (f.ustid.trim() ? tag("ram:SpecifiedTaxRegistration", tag("ram:ID", esc(f.ustid.replace(/\s/g, "")), ` schemeID="VA"`)) : "") +
      (f.steuernummer.trim() ? tag("ram:SpecifiedTaxRegistration", tag("ram:ID", esc(f.steuernummer.trim()), ` schemeID="FC"`)) : ""),
  );
  const kaeuferXml = tag(
    "ram:BuyerTradeParty",
    tag("ram:Name", esc(k.name)) +
      anschrift(k.strasse, k.plz, k.ort, landCode ?? "DE") +
      (k.email.trim() ? tag("ram:URIUniversalCommunication", tag("ram:URIID", esc(k.email.trim()), ` schemeID="EM"`)) : ""),
  );

  const zeitraum = tag("ram:BillingSpecifiedPeriod", d102("ram:StartDateTime", d.leistungVon) + d102("ram:EndDateTime", d.leistungBis));
  const rabatt =
    b.rabatt > 0
      ? tag(
          "ram:SpecifiedTradeAllowanceCharge",
          `<ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>` +
            tag("ram:CalculationPercent", String(b.rabattProzent)) +
            tag("ram:BasisAmount", betrag(b.netto)) +
            tag("ram:ActualAmount", betrag(b.rabatt)) +
            tag("ram:Reason", "Rabatt") +
            tag("ram:CategoryTradeTax", steuerBlock()),
        )
      : "";
  const steuerSumme = b.reverseCharge ? 0 : b.ust;
  // Reihenfolge nach dem Schema: Betrag, Typ, Befreiungsgrund, Basis, Kategorie, Befreiungscode, Satz
  const grund = b.reverseCharge ? tag("ram:ExemptionReason", esc(d.reverseChargeText)) : "";
  const grundCode = b.reverseCharge ? tag("ram:ExemptionReasonCode", "VATEX-EU-AE") : "";
  const kopfSteuer = tag(
    "ram:ApplicableTradeTax",
    tag("ram:CalculatedAmount", betrag(steuerSumme)) + tag("ram:TypeCode", "VAT") + grund + tag("ram:BasisAmount", betrag(b.nettoNachRabatt)) + tag("ram:CategoryCode", kategorie) + grundCode + tag("ram:RateApplicablePercent", String(satz)),
  );

  const brutto = b.brutto;
  const faellig = Math.round((brutto - d.abzugBrutto) * 100) / 100;
  const summen = tag(
    "ram:SpecifiedTradeSettlementHeaderMonetarySummation",
    tag("ram:LineTotalAmount", betrag(b.netto)) +
      (b.rabatt > 0 ? tag("ram:AllowanceTotalAmount", betrag(b.rabatt)) : "") +
      tag("ram:TaxBasisTotalAmount", betrag(b.nettoNachRabatt)) +
      tag("ram:TaxTotalAmount", betrag(steuerSumme), ` currencyID="EUR"`) +
      tag("ram:GrandTotalAmount", betrag(brutto)) +
      (d.abzugBrutto > 0 ? tag("ram:TotalPrepaidAmount", betrag(d.abzugBrutto)) : "") +
      tag("ram:DuePayableAmount", betrag(faellig)),
  );

  const zahlung = f.iban.trim()
    ? tag(
        "ram:SpecifiedTradeSettlementPaymentMeans",
        tag("ram:TypeCode", "58") +
          tag("ram:PayeePartyCreditorFinancialAccount", tag("ram:IBANID", esc(f.iban.replace(/\s/g, "")))) +
          (f.bic.trim() ? tag("ram:PayeeSpecifiedCreditorFinancialInstitution", tag("ram:BICID", esc(f.bic.trim()))) : ""),
      )
    : "";
  const bedingungen = tag(
    "ram:SpecifiedTradePaymentTerms",
    (d.zahlungsbedingung.trim() ? tag("ram:Description", esc(d.zahlungsbedingung.trim())) : "") + d102("ram:DueDateDateTime", d.faelligAm),
  );
  const bezugXml = d.bezug
    ? tag("ram:InvoiceReferencedDocument", tag("ram:IssuerAssignedID", esc(d.bezug.nummer)) + `<ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${datum(d.bezug.datum)}</qdt:DateTimeString></ram:FormattedIssueDateTime>`)
    : "";

  const leitlinie = xrechnung ? "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0" : "urn:cen.eu:en16931:2017";
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" ` +
    `xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">` +
    tag("rsm:ExchangedDocumentContext", tag("ram:GuidelineSpecifiedDocumentContextParameter", tag("ram:ID", leitlinie))) +
    tag("rsm:ExchangedDocument", tag("ram:ID", esc(d.nummer)) + tag("ram:TypeCode", typ) + d102("ram:IssueDateTime", d.datum) + (d.betreff.trim() ? tag("ram:IncludedNote", tag("ram:Content", esc(d.betreff.trim().slice(0, 500)))) : "")) +
    tag(
      "rsm:SupplyChainTradeTransaction",
      posXml +
        tag("ram:ApplicableHeaderTradeAgreement", (k.leitwegId.trim() ? tag("ram:BuyerReference", esc(k.leitwegId.trim())) : "") + verkaeuferXml + kaeuferXml) +
        tag("ram:ApplicableHeaderTradeDelivery", tag("ram:ActualDeliverySupplyChainEvent", d102("ram:OccurrenceDateTime", d.leistungBis))) +
        tag(
          "ram:ApplicableHeaderTradeSettlement",
          tag("ram:PaymentReference", esc(d.nummer)) + tag("ram:InvoiceCurrencyCode", "EUR") + zahlung + kopfSteuer + zeitraum + rabatt + bedingungen + summen + bezugXml,
        ),
    ) +
    `</rsm:CrossIndustryInvoice>\n`;

  return { xml, profil: xrechnung ? "xrechnung" : "en16931", warnungen };
}
