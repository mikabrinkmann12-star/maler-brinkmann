// Liest eine hochgeladene Lieferantenrechnung automatisch aus (kein Fremddienst, keine KI):
// 1. XML-Datei oder PDF mit eingebetteter E-Rechnung (ZUGFeRD/XRechnung): Daten sind maschinenlesbar und verlässlich.
// 2. normales PDF mit Text: Felder werden anhand der Beschriftungen gesucht (Vorschlag).
// 3. Foto/Scan ohne Text: nichts erkannt, die Felder trägt das Büro von Hand ein.

import { extractText, getDocumentProxy } from "unpdf";
import { eRechnungAusXml, xmlAusPdf } from "@/lib/e-rechnung-lesen";
import { felderAusText, vollstaendigkeit, type ErkannteFelder } from "@/lib/eingangsrechnung-erkennung";

export type ErkanntAus = "e-rechnung" | "pdf-text" | "keine";

export type Auslese = ErkannteFelder & {
  erkanntAus: ErkanntAus;
  /** Muss ein Mensch bestätigen? Nur eine vollständig gelesene E-Rechnung gilt gleich als geprüft. */
  zuPruefen: boolean;
};

const LEER: ErkannteFelder = { lieferant: "", rechnungsnummer: "", rechnungsdatum: null, faelligAm: null, netto: null, brutto: null, iban: "" };

export async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    return "";
  }
}

export async function rechnungAuslesen(
  bytes: Uint8Array,
  endung: string,
  bekannteLieferanten: string[],
  eigeneNamen: string[],
): Promise<Auslese> {
  const e = endung.toLowerCase();

  if (e === "xml") {
    const daten = eRechnungAusXml(new TextDecoder("utf-8").decode(bytes));
    if (daten) {
      const felder: ErkannteFelder = { ...daten };
      return { ...felder, erkanntAus: "e-rechnung", zuPruefen: vollstaendigkeit(felder) < 4 };
    }
    return { ...LEER, erkanntAus: "keine", zuPruefen: true };
  }

  if (e === "pdf") {
    const xml = await xmlAusPdf(bytes);
    const daten = xml ? eRechnungAusXml(xml) : null;
    if (daten) {
      const felder: ErkannteFelder = { ...daten };
      return { ...felder, erkanntAus: "e-rechnung", zuPruefen: vollstaendigkeit(felder) < 4 };
    }
    const text = await pdfText(bytes);
    if (text.trim().length > 20) {
      const felder = felderAusText(text, bekannteLieferanten, eigeneNamen);
      return { ...felder, erkanntAus: vollstaendigkeit(felder) > 0 ? "pdf-text" : "keine", zuPruefen: true };
    }
  }

  return { ...LEER, erkanntAus: "keine", zuPruefen: true };
}
