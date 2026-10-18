// Liest strukturierte E-Rechnungen (XRechnung/ZUGFeRD/Factur-X als XML, auch eingebettet in ein PDF) aus.
// Läuft ohne KI und ohne Fremddienst: Die Daten stehen maschinenlesbar in der Datei.

import { XMLParser } from "fast-xml-parser";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString, decodePDFRawStream } from "pdf-lib";

export type ERechnungDaten = {
  lieferant: string;
  rechnungsnummer: string;
  /** JJJJ-MM-TT */
  rechnungsdatum: string | null;
  faelligAm: string | null;
  netto: number | null;
  brutto: number | null;
  iban: string;
};

type Knoten = unknown;

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, trimValues: true, parseTagValue: false });

/** Wert am Pfad (Namen ohne Namensraum), nimmt bei Listen das erste Element. */
function holen(wurzel: Knoten, ...pfad: string[]): Knoten {
  let k: Knoten = wurzel;
  for (const name of pfad) {
    if (Array.isArray(k)) k = k[0];
    if (k === null || typeof k !== "object") return undefined;
    k = (k as Record<string, Knoten>)[name];
  }
  return Array.isArray(k) ? k[0] : k;
}

function text(k: Knoten): string {
  return typeof k === "string" || typeof k === "number" ? String(k).trim() : "";
}

function zahl(k: Knoten): number | null {
  const t = text(k);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** „20260312“ oder „2026-03-12“ (auch mit Uhrzeit) → „2026-03-12“ */
function datum(k: Knoten): string | null {
  const t = text(k);
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(t);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Wertet den XML-Text einer E-Rechnung aus; null, wenn es keine erkennbare Rechnung ist. */
export function eRechnungAusXml(xml: string): ERechnungDaten | null {
  let baum: Record<string, Knoten>;
  try {
    baum = parser.parse(xml) as Record<string, Knoten>;
  } catch {
    return null;
  }

  // CII: ZUGFeRD, Factur-X, XRechnung (CII)
  const cii = baum["CrossIndustryInvoice"];
  if (cii) {
    const handel = holen(cii, "SupplyChainTradeTransaction");
    const einigung = holen(handel, "ApplicableHeaderTradeAgreement");
    const abrechnung = holen(handel, "ApplicableHeaderTradeSettlement");
    const summen = holen(abrechnung, "SpecifiedTradeSettlementHeaderMonetarySummation");
    const gutschrift = text(holen(cii, "ExchangedDocument", "TypeCode")) === "381";
    const vorzeichen = gutschrift ? -1 : 1;
    const netto = zahl(holen(summen, "TaxBasisTotalAmount")) ?? zahl(holen(summen, "LineTotalAmount"));
    const brutto = zahl(holen(summen, "GrandTotalAmount")) ?? zahl(holen(summen, "DuePayableAmount"));
    return {
      lieferant: text(holen(einigung, "SellerTradeParty", "Name")),
      rechnungsnummer: text(holen(cii, "ExchangedDocument", "ID")),
      rechnungsdatum: datum(holen(cii, "ExchangedDocument", "IssueDateTime", "DateTimeString")),
      faelligAm: datum(holen(abrechnung, "SpecifiedTradePaymentTerms", "DueDateDateTime", "DateTimeString")),
      netto: netto === null ? null : netto * vorzeichen,
      brutto: brutto === null ? null : brutto * vorzeichen,
      iban: text(holen(abrechnung, "SpecifiedTradeSettlementPaymentMeans", "PayeePartyCreditorFinancialAccount", "IBANID")).replace(/\s+/g, ""),
    };
  }

  // UBL: XRechnung (UBL), Peppol
  const ubl = baum["Invoice"] ?? baum["CreditNote"];
  if (ubl) {
    const gutschrift = "CreditNote" in baum;
    const vorzeichen = gutschrift ? -1 : 1;
    const partei = holen(ubl, "AccountingSupplierParty", "Party");
    const summen = holen(ubl, "LegalMonetaryTotal");
    const netto = zahl(holen(summen, "TaxExclusiveAmount")) ?? zahl(holen(summen, "LineExtensionAmount"));
    const brutto = zahl(holen(summen, "TaxInclusiveAmount")) ?? zahl(holen(summen, "PayableAmount"));
    return {
      lieferant: text(holen(partei, "PartyLegalEntity", "RegistrationName")) || text(holen(partei, "PartyName", "Name")),
      rechnungsnummer: text(holen(ubl, "ID")),
      rechnungsdatum: datum(holen(ubl, "IssueDate")),
      faelligAm: datum(holen(ubl, "DueDate")) ?? datum(holen(ubl, "PaymentMeans", "PaymentDueDate")),
      netto: netto === null ? null : netto * vorzeichen,
      brutto: brutto === null ? null : brutto * vorzeichen,
      iban: text(holen(ubl, "PaymentMeans", "PayeeFinancialAccount", "ID")).replace(/\s+/g, ""),
    };
  }
  return null;
}

/** Sucht in einem PDF eingebettete XML-Dateien (ZUGFeRD: factur-x.xml, zugferd-invoice.xml, xrechnung.xml). */
export async function xmlAusPdf(bytes: Uint8Array): Promise<string | null> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    return null;
  }
  const funde: { name: string; xml: string }[] = [];

  function dateiAuslesen(spec: PDFDict) {
    const nameObj = spec.lookup(PDFName.of("UF")) ?? spec.lookup(PDFName.of("F"));
    const name = nameObj instanceof PDFString || nameObj instanceof PDFHexString ? nameObj.decodeText() : "";
    const ef = spec.lookupMaybe(PDFName.of("EF"), PDFDict);
    const strom = ef?.lookup(PDFName.of("F")) ?? ef?.lookup(PDFName.of("UF"));
    if (!(strom instanceof PDFRawStream)) return;
    try {
      const inhalt = decodePDFRawStream(strom).decode();
      const t = new TextDecoder("utf-8").decode(inhalt);
      if (/\.xml$/i.test(name) || t.trimStart().startsWith("<")) funde.push({ name, xml: t });
    } catch {
      // nicht lesbar: ignorieren
    }
  }

  function baumDurchlaufen(knoten: PDFDict, tiefe: number) {
    if (tiefe > 6) return;
    const namen = knoten.lookupMaybe(PDFName.of("Names"), PDFArray);
    if (namen) {
      for (let i = 1; i < namen.size(); i += 2) {
        const spec = namen.lookupMaybe(i, PDFDict);
        if (spec) dateiAuslesen(spec);
      }
    }
    const kinder = knoten.lookupMaybe(PDFName.of("Kids"), PDFArray);
    if (kinder) {
      for (let i = 0; i < kinder.size(); i += 1) {
        const kind = kinder.lookupMaybe(i, PDFDict);
        if (kind) baumDurchlaufen(kind, tiefe + 1);
      }
    }
  }

  try {
    const namen = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
    const eingebettet = namen?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
    if (eingebettet) baumDurchlaufen(eingebettet, 0);
  } catch {
    return null;
  }
  // Die Rechnungs-XML bevorzugen (bekannte Namen), sonst die erste XML
  const bekannt = funde.find((f) => /(factur-x|zugferd|xrechnung|invoice|rechnung)/i.test(f.name));
  return (bekannt ?? funde[0])?.xml ?? null;
}
