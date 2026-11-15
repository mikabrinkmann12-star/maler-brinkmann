import { describe, expect, it } from "vitest";
import { betragAusText, camtKontoauszug, csvKontoauszug, datumAusText, kontoauszugLesen } from "./kontoauszug";
import { nummerImZweck, zahlungenZuordnen, type OffeneAusgang, type OffeneEingang } from "./zahlungsabgleich";

// Aufbau wie der Umsatz-Export der Volksbanken (Semikolon, Kopfzeile, deutsche Zahlen); Daten erfunden
const VOLKSBANK = [
  "Bezeichnung Auftragskonto;IBAN Auftragskonto;BIC Auftragskonto;Bankname Auftragskonto;Buchungstag;Valutadatum;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;BIC (SWIFT-Code) Zahlungsbeteiligter;Buchungstext;Verwendungszweck;Betrag;Waehrung;Saldo nach Buchung;Bemerkung;Kategorie;Steuerrelevant;Glaeubiger ID;Mandatsreferenz",
  "Geschäftskonto;DE00280000000000000000;GENODEF1XXX;Volksbank;12.11.2026;12.11.2026;Farben Müller GmbH;DE89 3704 0044 0532 0130 00;COBADEFFXXX;Überweisung;RE-2026-0815 Kd 4711;-119,00;EUR;5.000,00;;;;;",
  "Geschäftskonto;DE00280000000000000000;GENODEF1XXX;Volksbank;13.11.2026;13.11.2026;Anna Muster;DE02120300000000202051;BYLADEM1001;Gutschrift;Rechnung RE260003;1.166,20;EUR;6.166,20;;;;;",
  "Geschäftskonto;DE00280000000000000000;GENODEF1XXX;Volksbank;14.11.2026;14.11.2026;Tankstelle;;;Kartenzahlung;Tanken;-80,00;EUR;6.086,20;;;;;",
].join("\r\n");

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
<Ntry><Amt Ccy="EUR">119.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-11-12</Dt></BookgDt>
<NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Farben Mueller GmbH</Nm></Cdtr><CdtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></CdtrAcct></RltdPties>
<RmtInf><Ustrd>RE-2026-0815</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">1166.20</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-11-13</Dt></BookgDt>
<NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Anna Muster</Nm></Dbtr></RltdPties><RmtInf><Ustrd>RE260003</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
</Stmt></BkToCstmrStmt></Document>`;

const eingang: OffeneEingang[] = [
  { id: "e1", lieferant: "Farben Müller GmbH", rechnungsnummer: "RE-2026-0815", rechnungsdatum: "2026-11-01", brutto: 119, iban: "DE89370400440532013000", gutschrift: false },
  { id: "e2", lieferant: "Werkzeug Meyer", rechnungsnummer: "W-1", rechnungsdatum: "2026-11-01", brutto: 80, iban: "", gutschrift: false },
];
const ausgang: OffeneAusgang[] = [
  { id: "a1", rechnungsnummer: "RE260003", kunde: "Anna Muster", rechnungsdatum: "2026-11-05", brutto: 1190, skontoProzent: 2, skontoTage: 10 },
];

describe("Kontoauszug lesen", () => {
  it("Zahlen und Daten", () => {
    expect(betragAusText("-1.234,56")).toBe(-1234.56);
    expect(betragAusText("1234.56")).toBe(1234.56);
    expect(betragAusText("100,00 S")).toBe(-100);
    expect(datumAusText("13.11.26")).toBe("2026-11-13");
    expect(datumAusText("2026-11-13T10:00:00")).toBe("2026-11-13");
  });

  it("Volksbank-CSV", () => {
    const r = csvKontoauszug(VOLKSBANK);
    if ("fehler" in r) throw new Error(r.fehler);
    expect(r.umsaetze).toHaveLength(3);
    expect(r.umsaetze[0]).toEqual({ datum: "2026-11-12", betrag: -119, name: "Farben Müller GmbH", iban: "DE89370400440532013000", zweck: "RE-2026-0815 Kd 4711" });
    expect(r.umsaetze[1].betrag).toBe(1166.2);
  });

  it("CAMT-XML und Erkennung über die Datei", () => {
    const r = kontoauszugLesen(new TextEncoder().encode(CAMT), "auszug.xml");
    if ("fehler" in r) throw new Error(r.fehler);
    expect(r.format).toBe("camt");
    expect(r.umsaetze[0]).toMatchObject({ betrag: -119, name: "Farben Mueller GmbH", iban: "DE89370400440532013000", zweck: "RE-2026-0815" });
    expect(r.umsaetze[1]).toMatchObject({ betrag: 1166.2, name: "Anna Muster", zweck: "RE260003" });
    expect(camtKontoauszug("<x/>")).toHaveProperty("fehler");
    expect(kontoauszugLesen(new Uint8Array([0x50, 0x4b, 3, 4]), "a.zip")).toHaveProperty("fehler");
    expect(kontoauszugLesen(new TextEncoder().encode("a;b\n1;2"), "a.csv")).toHaveProperty("fehler");
  });
});

describe("Zuordnung", () => {
  it("Abbuchung → Eingangsrechnung, Eingang mit Skonto → eigene Rechnung, nur Betrag → kein Vorschlag", () => {
    const r = csvKontoauszug(VOLKSBANK);
    if ("fehler" in r) throw new Error(r.fehler);
    const v = zahlungenZuordnen(r.umsaetze, eingang, ausgang);
    expect(v.map((x) => [x.art, x.id])).toEqual([["eingang", "e1"], ["ausgang", "a1"]]);
    expect(v[1].gruende[0]).toContain("Skonto");
  });

  it("Gutschrift eines Lieferanten passt zu einem Geldeingang, nicht zu einer Abbuchung", () => {
    const gs: OffeneEingang = { ...eingang[0], id: "g1", gutschrift: true };
    expect(zahlungenZuordnen([{ datum: "2026-11-12", betrag: 119, name: "Farben Müller GmbH", iban: "", zweck: "Gutschrift RE-2026-0815" }], [gs], [])[0]?.id).toBe("g1");
    expect(zahlungenZuordnen([{ datum: "2026-11-12", betrag: -119, name: "Farben Müller GmbH", iban: "", zweck: "RE-2026-0815" }], [gs], [])).toEqual([]);
  });

  it("jede Rechnung und jeder Umsatz nur einmal", () => {
    const u = { datum: "2026-11-12", betrag: -119, name: "Farben Müller GmbH", iban: "", zweck: "RE-2026-0815" };
    expect(zahlungenZuordnen([u, u], eingang, [])).toHaveLength(1);
    expect(nummerImZweck("RE-2026-0815", "re 2026 0815")).toBe(true);
    expect(nummerImZweck("12", "Rechnung 12345")).toBe(false);
  });
});
