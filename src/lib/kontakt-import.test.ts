import { describe, expect, it } from "vitest";
import { csvAlsObjekte, csvLesen, trennzeichenErkennen } from "./csv";
import { dublettenSchluessel, importStatus, kontakteAusCsv, plancraftZuKontakt } from "./kontakt-import";

// Erfundene Daten im Format des Plancraft-Exports (Google-Kontakte)
const KOPF =
  "Name,Title,Given Name,Additional Name,Family Name,Organization 1 - Name,E-mail 1 - Value,E-mail 2 - Value,Phone 1 - Type,Phone 1 - Value,Phone 2 - Type,Phone 2 - Value,Address 1 - Street,Address 1 - City,Address 1 - Postal Code,Address 1 - Extended Address,Website 1 - Value,Customer ID,Description,Type";
const csv = (...zeilen: string[]) => `﻿${KOPF}\r\n${zeilen.join("\r\n")}\r\n`;

describe("csvLesen", () => {
  it("liest Anführungszeichen, Kommas und Zeilenumbrüche in Feldern", () => {
    const t = csvLesen('a,b\n"x, y","zeile1\nzeile2"\n"sagt ""hi""",3\n');
    expect(t).toEqual([["a", "b"], ["x, y", "zeile1\nzeile2"], ['sagt "hi"', "3"]]);
  });

  it("erkennt Semikolon und ignoriert BOM und Leerzeilen", () => {
    expect(trennzeichenErkennen("a;b;c\n1;2;3")).toBe(";");
    expect(csvAlsObjekte("﻿a;b\n\n1;2\n").zeilen).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("plancraftZuKontakt", () => {
  const objekt = (zeile: string) => csvAlsObjekte(csv(zeile)).zeilen[0];

  it("Privatperson mit Anrede, Adresse und Kundennummer", () => {
    const k = plancraftZuKontakt(objekt("Erika Muster,Frau,Erika,,Muster,,e@example.com,,work,04498 1234,,,Gartenallee 2,Saterland,26683,,,KD-100001,,person"));
    expect(k).toMatchObject({
      kundennummer: "KD-100001", typ: "privat", anrede: "Frau", vorname: "Erika", nachname: "Muster",
      strasse: "Gartenallee 2", plz: "26683", ort: "Saterland", telefon: "04498 1234", mobil: "", email: "e@example.com",
    });
  });

  it("„Familie Schröder“ ohne Nachnamen: der Name wird Nachname", () => {
    const k = plancraftZuKontakt(objekt("Schröder,Familie,Schröder,,,,,,,,,,Eichenkamp 18,Saterland,26683,,,,,person"));
    expect(k).toMatchObject({ anrede: "Familie", vorname: "", nachname: "Schröder", kundennummer: null });
  });

  it("Firma: Name steht in der Organisation, Ansprechpartner aus Vor-/Nachname", () => {
    const k = plancraftZuKontakt(objekt(",,Hans,,Beispiel,Musterbau GmbH,,,,,,,Hauptstraße 5,Friesoythe,26169,,,KD-100002,,organisation"));
    expect(k).toMatchObject({ typ: "firma", firmenname: "Musterbau GmbH", ansprechpartner: "Hans Beispiel", nachname: "" });
  });

  it("Handy kommt in „Mobil“, Webseite ins eigene Feld, Zusätze und zweite E-Mail in die Notizen", () => {
    const k = plancraftZuKontakt(objekt("Max Test,Herr,Max,,Test,,m@example.com,zweite@example.com,mobile,0170 111,work,04498 222,Weg 1,Ort,26683,Hinterhaus,www.example.com,,Schlüssel beim Nachbarn,person"));
    expect(k).toMatchObject({ mobil: "0170 111", telefon: "04498 222" });
    expect((k as { notizen: string }).notizen).toBe(
      "Schlüssel beim Nachbarn\nAdresszusatz: Hinterhaus\nWeitere E-Mail: zweite@example.com",
    );
    expect(k).toMatchObject({ website: "www.example.com" });
  });

  it("PLZ mit Ort wird getrennt; ohne Namen gibt es einen Fehler", () => {
    const k = plancraftZuKontakt(objekt("Eva Neu,Frau,Eva,,Neu,,,,,,,,Dorfweg 3,,26899 Esterwegen,,,,,person"));
    expect(k).toMatchObject({ plz: "26899", ort: "Esterwegen" });
    expect(plancraftZuKontakt(objekt(",,,,,,,,,,,,Dorfweg 3,Ort,26683,,,,,person"))).toEqual({ fehler: "Weder Name noch Firma vorhanden." });
  });
});

describe("kontakteAusCsv und importStatus", () => {
  const datei = csv(
    "Erika Muster,Frau,Erika,,Muster,,,,,,,,Gartenallee 2,Saterland,26683,,,KD-1,,person",
    "Max Test,Herr,Max,,Test,,,,,,,,Weg 1,Ort,26683,,,KD-2,,person",
    "E. Muster,,Erika,,Muster,,,,,,,,gartenallee 2,Saterland,26683,,,KD-3,,person", // gleicher Name + Adresse wie KD-1
    "Zweiter Max,Herr,Max,,Test,,,,,,,,Weg 1,Ort,26683,,,KD-2,,person", // doppelte Kundennummer
    ",,,,,,,,,,,,Nirgends 1,Ort,26683,,,KD-5,,person",
  );

  it("liest alle Zeilen, Zeilennummern wie in Excel", () => {
    const { zeilen, fehlendeSpalten } = kontakteAusCsv(datei);
    expect(fehlendeSpalten).toEqual([]);
    expect(zeilen.map((z) => z.zeile)).toEqual([2, 3, 4, 5, 6]);
    expect(zeilen[4].fehler).toBeTruthy();
  });

  it("meldet fehlende Spalten statt zu raten", () => {
    expect(kontakteAusCsv("Vorname,Nachname\nA,B").fehlendeSpalten).toContain("Customer ID");
  });

  it("erkennt vorhanden, Dublette, doppelt in der Datei und Fehler", () => {
    const { zeilen } = kontakteAusCsv(datei);
    const bestehend = {
      kundennummern: new Set(["KD-1"]),
      schluessel: new Set<string>(),
    };
    expect(importStatus(zeilen, bestehend)).toEqual(["vorhanden", "neu", "dublette" /* nicht: s. unten */, "doppelt_in_datei", "fehler"].map((s, i) => (i === 2 ? "neu" : s)));
  });

  it("Name + Adresse eines gespeicherten Kontakts gilt als Dublette (Schreibweise egal)", () => {
    const { zeilen } = kontakteAusCsv(datei);
    const schluessel = new Set([dublettenSchluessel({ firmenname: "", vorname: "Erika", nachname: "Muster", strasse: "Gartenallee 2", plz: "26683" })]);
    const status = importStatus(zeilen, { kundennummern: new Set(), schluessel });
    expect(status[0]).toBe("dublette");
    expect(status[2]).toBe("dublette");
    expect(status[1]).toBe("neu");
  });
});
