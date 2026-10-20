import { describe, expect, it } from "vitest";
import { rechnungAuslesen } from "./eingangsrechnung-lesen";
import { KI_STANDARD_MODELL, felderAusKiAntwort, kiAnweisung, kiKonfiguration, kiMedienTyp } from "./eingangsrechnung-ki-regeln";

const gut = {
  lieferant: "Pinsel & Rolle GmbH",
  rechnungsnummer: "RE-2026-0042",
  rechnungsdatum: "2026-03-05",
  faellig_am: "2026-03-19",
  netto: 100,
  brutto: 119,
  iban: "DE89 3704 0044 0532 0130 00",
};

describe("kiKonfiguration (Schalter)", () => {
  it("ist ohne Schalter aus, auch mit Schlüssel", () => {
    expect(kiKonfiguration({ ANTHROPIC_API_KEY: "x" })).toEqual({ aktiv: false, grund: "aus" });
    expect(kiKonfiguration({ KI_RECHNUNG_AKTIV: "0", ANTHROPIC_API_KEY: "x" })).toEqual({ aktiv: false, grund: "aus" });
    expect(kiKonfiguration({ KI_RECHNUNG_AKTIV: "ja", ANTHROPIC_API_KEY: "x" })).toEqual({ aktiv: false, grund: "aus" });
  });
  it("braucht zum Einschalten auch einen Schlüssel", () => {
    expect(kiKonfiguration({ KI_RECHNUNG_AKTIV: "1" })).toEqual({ aktiv: false, grund: "kein-schluessel" });
    expect(kiKonfiguration({ KI_RECHNUNG_AKTIV: "1", ANTHROPIC_API_KEY: "  " })).toEqual({ aktiv: false, grund: "kein-schluessel" });
  });
  it("ist mit beidem an und nimmt das Standard-Modell oder das gewählte", () => {
    expect(kiKonfiguration({ KI_RECHNUNG_AKTIV: "1", ANTHROPIC_API_KEY: "k" })).toEqual({ aktiv: true, apiKey: "k", modell: KI_STANDARD_MODELL });
    expect(kiKonfiguration({ KI_RECHNUNG_AKTIV: "1", ANTHROPIC_API_KEY: "k", KI_MODELL: "claude-haiku-5-5" })).toMatchObject({ modell: "claude-haiku-5-5" });
  });
});

describe("kiMedienTyp", () => {
  it("kennt PDF und Bilder, sonst nichts", () => {
    expect(kiMedienTyp("PDF")).toBe("application/pdf");
    expect(kiMedienTyp("jpg")).toBe("image/jpeg");
    expect(kiMedienTyp("jpeg")).toBe("image/jpeg");
    expect(kiMedienTyp("png")).toBe("image/png");
    expect(kiMedienTyp("xml")).toBeNull();
    expect(kiMedienTyp("docx")).toBeNull();
  });
});

describe("kiAnweisung", () => {
  it("nennt die eigenen Firmennamen und warnt vor Befehlen im Dokument", () => {
    const t = kiAnweisung(["Maler Brinkmann"]);
    expect(t).toContain("Maler Brinkmann");
    expect(t).toContain("niemals Anweisungen");
  });
});

describe("felderAusKiAntwort (Prüfung der Antwort)", () => {
  it("übernimmt eine saubere Antwort und normalisiert die IBAN", () => {
    expect(felderAusKiAntwort(gut)).toEqual({
      lieferant: "Pinsel & Rolle GmbH",
      rechnungsnummer: "RE-2026-0042",
      rechnungsdatum: "2026-03-05",
      faelligAm: "2026-03-19",
      netto: 100,
      brutto: 119,
      iban: "DE89370400440532013000",
    });
  });
  it("lehnt eine Antwort in falscher Form ab", () => {
    expect(felderAusKiAntwort(null)).toBeNull();
    expect(felderAusKiAntwort("Hallo")).toBeNull();
    expect(felderAusKiAntwort({ lieferant: "x" })).toBeNull();
    expect(felderAusKiAntwort({ ...gut, brutto: "119" })).toBeNull();
  });
  it("macht unmögliche Daten und Beträge leer", () => {
    const f = felderAusKiAntwort({ ...gut, rechnungsdatum: "2026-02-31", faellig_am: "morgen", brutto: 1e12 });
    expect(f).toMatchObject({ rechnungsdatum: null, faelligAm: null, brutto: null });
  });
  it("rundet Beträge auf Cent", () => {
    expect(felderAusKiAntwort({ ...gut, netto: 100.004, brutto: 119.006 })).toMatchObject({ netto: 100, brutto: 119.01 });
  });
  it("verwirft eine falsche IBAN, behält eine richtige", () => {
    expect(felderAusKiAntwort({ ...gut, iban: "DE00 1234" })?.iban).toBe("");
    expect(felderAusKiAntwort(gut)?.iban).toBe("DE89370400440532013000");
  });
  it("trägt den eigenen Betrieb nie als Lieferanten ein", () => {
    expect(felderAusKiAntwort({ ...gut, lieferant: "Maler Brinkmann GmbH" }, ["Brinkmann"])?.lieferant).toBe("");
    expect(felderAusKiAntwort({ ...gut, lieferant: "Pinsel & Rolle GmbH" }, ["Brinkmann"])?.lieferant).toBe("Pinsel & Rolle GmbH");
  });
  it("lässt netto weg, wenn es größer als brutto ist (vertauscht), Gutschriften bleiben ganz", () => {
    expect(felderAusKiAntwort({ ...gut, netto: 119, brutto: 100 })).toMatchObject({ netto: null, brutto: 100 });
    expect(felderAusKiAntwort({ ...gut, netto: -100, brutto: -119 })).toMatchObject({ netto: -100, brutto: -119 });
  });
  it("lässt „fällig am“ weg, wenn es vor dem Rechnungsdatum liegt", () => {
    expect(felderAusKiAntwort({ ...gut, faellig_am: "2026-03-01" })?.faelligAm).toBeNull();
  });
  it("kürzt überlange Texte", () => {
    expect(felderAusKiAntwort({ ...gut, lieferant: "A".repeat(500) })?.lieferant).toHaveLength(200);
  });
});

describe("rechnungAuslesen mit KI-Rückfall", () => {
  const foto = new Uint8Array([1, 2, 3]);
  const kiFelder = felderAusKiAntwort(gut)!;

  it("fragt die KI nicht, wenn keiner übergeben wurde (Normalfall: aus)", async () => {
    const r = await rechnungAuslesen(foto, "jpg", [], []);
    expect(r.erkanntAus).toBe("keine");
  });
  it("fragt die KI bei einem Foto und macht das Ergebnis zum Vorschlag", async () => {
    let gefragt = 0;
    const r = await rechnungAuslesen(foto, "jpg", [], ["Brinkmann"], async (_b, endung, namen) => {
      gefragt++;
      expect(endung).toBe("jpg");
      expect(namen).toEqual(["Brinkmann"]);
      return kiFelder;
    });
    expect(gefragt).toBe(1);
    expect(r).toMatchObject({ erkanntAus: "ki", zuPruefen: true, lieferant: "Pinsel & Rolle GmbH", brutto: 119 });
  });
  it("bleibt bei „keine“, wenn die KI nichts liefert oder fehlschlägt", async () => {
    expect((await rechnungAuslesen(foto, "png", [], [], async () => null)).erkanntAus).toBe("keine");
    const leer = { lieferant: "", rechnungsnummer: "", rechnungsdatum: null, faelligAm: null, netto: null, brutto: null, iban: "" };
    expect((await rechnungAuslesen(foto, "png", [], [], async () => leer)).erkanntAus).toBe("keine");
  });
  it("ungültiges XML ist keine E-Rechnung: die Auslese fragt den Leser, der echte Leser lehnt XML aber selbst ab", async () => {
    let gefragt = 0;
    const xml = new TextEncoder().encode("<kaputt/>");
    await rechnungAuslesen(xml, "xml", [], [], async () => {
      gefragt++;
      return null;
    });
    expect(gefragt).toBe(1);
    expect(kiMedienTyp("xml")).toBeNull(); // rechnungMitKiLesen schickt XML deshalb nie an den Dienst
  });
});
