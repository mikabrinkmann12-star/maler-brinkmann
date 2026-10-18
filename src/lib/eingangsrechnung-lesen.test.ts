import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { eRechnungAusXml } from "./e-rechnung-lesen";
import { rechnungAuslesen } from "./eingangsrechnung-lesen";

// Erfundene Beispieldaten (keine echte Firma)
const CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument>
    <ram:ID>RE-2026-0042</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">20260305</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>Pinsel &amp; Rolle GmbH</ram:Name></ram:SellerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>DE89 3704 0044 0532 0130 00</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime><udt:DateTimeString format="102">20260319</udt:DateTimeString></ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>200.00</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>200.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">38.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>238.00</ram:GrandTotalAmount>
        <ram:DuePayableAmount>238.00</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

const UBL = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>2026-777</cbc:ID>
  <cbc:IssueDate>2026-04-10</cbc:IssueDate>
  <cbc:DueDate>2026-04-24</cbc:DueDate>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyLegalEntity><cbc:RegistrationName>Gerüstbau Nord KG</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:PaymentMeans><cac:PayeeFinancialAccount><cbc:ID>DE89370400440532013000</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="EUR">1000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">1190.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">1190.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;

describe("eRechnungAusXml", () => {
  it("liest eine CII-Rechnung (ZUGFeRD/XRechnung)", () => {
    expect(eRechnungAusXml(CII)).toEqual({
      lieferant: "Pinsel & Rolle GmbH",
      rechnungsnummer: "RE-2026-0042",
      rechnungsdatum: "2026-03-05",
      faelligAm: "2026-03-19",
      netto: 200,
      brutto: 238,
      iban: "DE89370400440532013000",
    });
  });

  it("liest eine UBL-Rechnung", () => {
    expect(eRechnungAusXml(UBL)).toEqual({
      lieferant: "Gerüstbau Nord KG",
      rechnungsnummer: "2026-777",
      rechnungsdatum: "2026-04-10",
      faelligAm: "2026-04-24",
      netto: 1000,
      brutto: 1190,
      iban: "DE89370400440532013000",
    });
  });

  it("dreht bei einer Gutschrift (Typ 381) die Vorzeichen um", () => {
    const r = eRechnungAusXml(CII.replace("<ram:TypeCode>380", "<ram:TypeCode>381"));
    expect(r?.brutto).toBe(-238);
    expect(r?.netto).toBe(-200);
  });

  it("erkennt Unsinn als „keine Rechnung“", () => {
    expect(eRechnungAusXml("<html><body>Hallo</body></html>")).toBeNull();
    expect(eRechnungAusXml("kein xml")).toBeNull();
  });
});

async function textPdf(zeilen: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const seite = doc.addPage([595, 842]);
  zeilen.forEach((z, i) => seite.drawText(z, { x: 50, y: 790 - i * 16, size: 11, font }));
  return doc.save();
}

describe("rechnungAuslesen", () => {
  it("liest eine XML-Datei als E-Rechnung und gilt als geprüft, wenn alles da ist", async () => {
    const r = await rechnungAuslesen(new TextEncoder().encode(CII), "xml", [], []);
    expect(r.erkanntAus).toBe("e-rechnung");
    expect(r.zuPruefen).toBe(false);
    expect(r.brutto).toBe(238);
  });

  it("findet die E-Rechnung, die in ein PDF eingebettet ist (ZUGFeRD)", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]).drawText("Rechnung (Ansicht)");
    await doc.attach(new TextEncoder().encode(CII), "factur-x.xml", { mimeType: "text/xml", description: "E-Rechnung" });
    const r = await rechnungAuslesen(await doc.save(), "pdf", [], []);
    expect(r.erkanntAus).toBe("e-rechnung");
    expect(r.rechnungsnummer).toBe("RE-2026-0042");
    expect(r.lieferant).toBe("Pinsel & Rolle GmbH");
    expect(r.zuPruefen).toBe(false);
  });

  it("liest den Text eines normalen PDFs und lässt es prüfen", async () => {
    const pdf = await textPdf([
      "Farben Mueller GmbH - Industrieweg 4 - 26683 Saterland",
      "Maler Betrieb Brinkmann",
      "Rechnungsnummer: RE-2026-0815",
      "Rechnungsdatum: 12.03.2026",
      "Nettobetrag 100,00 EUR",
      "19 % USt 19,00 EUR",
      "Gesamtbetrag 119,00 EUR",
      "Zahlbar innerhalb von 14 Tagen netto.",
    ]);
    const r = await rechnungAuslesen(pdf, "pdf", [], ["Brinkmann"]);
    expect(r.erkanntAus).toBe("pdf-text");
    expect(r.zuPruefen).toBe(true);
    expect(r.rechnungsnummer).toBe("RE-2026-0815");
    expect(r.rechnungsdatum).toBe("2026-03-12");
    expect(r.brutto).toBe(119);
    expect(r.netto).toBe(100);
    expect(r.faelligAm).toBe("2026-03-26");
    expect(r.lieferant).toBe("Farben Mueller GmbH");
  });

  it("erkennt nichts bei einem Foto", async () => {
    const r = await rechnungAuslesen(new Uint8Array([1, 2, 3]), "jpg", [], []);
    expect(r.erkanntAus).toBe("keine");
    expect(r.zuPruefen).toBe(true);
  });
});
