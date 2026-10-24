import { describe, expect, it } from "vitest";
import { FIRMA_LEER, type Firma } from "./firma";
import { faelligkeitsDatum, pflichtangabenFehlen, praefixGueltig, rechnungsnummerBeispiel, reverseChargeHinweis } from "./rechnung-eigen";

const firma: Firma = { ...FIRMA_LEER, name: "Maler Betrieb Brinkmann", strasse: "Zur Ziegelei 18", plz: "26683", ort: "Saterland", steuernummer: "56/106/09816" };

describe("rechnungsnummerBeispiel", () => {
  it("Kürzel, Jahr und vierstellige laufende Nummer", () => {
    expect(rechnungsnummerBeispiel("R-", 2026, 1)).toBe("R-2026-0001");
    expect(rechnungsnummerBeispiel("RE", 2027, 123)).toBe("RE2027-0123");
    expect(rechnungsnummerBeispiel(" ", 2026, 5)).toBe("R-2026-0005");
    expect(rechnungsnummerBeispiel("R-", 2026, 12345)).toBe("R-2026-12345");
  });
});

describe("praefixGueltig", () => {
  it("erlaubt kurze Kürzel ohne Leerzeichen und Sonderzeichen", () => {
    expect(praefixGueltig("R-")).toBe(true);
    expect(praefixGueltig("RE")).toBe(true);
    expect(praefixGueltig("")).toBe(false);
    expect(praefixGueltig("R 1")).toBe(false);
    expect(praefixGueltig("ABCDEFGHIJK")).toBe(false);
    expect(praefixGueltig("R;x")).toBe(false);
  });
});

describe("pflichtangabenFehlen", () => {
  const anschrift = ["Frau Anna Muster", "Hauptstraße 1", "26683 Saterland"];
  it("alles da", () => {
    expect(pflichtangabenFehlen(firma, anschrift, false)).toEqual([]);
  });
  it("USt-IdNr. genügt statt Steuernummer", () => {
    expect(pflichtangabenFehlen({ ...firma, steuernummer: "", ustid: "DE123456789" }, anschrift, false)).toEqual([]);
  });
  it("nennt, was fehlt", () => {
    expect(pflichtangabenFehlen({ ...firma, steuernummer: "", name: "" }, ["Nur Name"], false)).toEqual([
      "Firmenname",
      "Steuernummer oder USt-IdNr. der Firma",
      "Anschrift des Kunden (Name und Straße/Ort)",
    ]);
    expect(pflichtangabenFehlen({ ...firma, plz: "" }, anschrift, false)).toEqual(["Firmenanschrift (Straße, PLZ, Ort)"]);
  });
});

describe("faelligkeitsDatum / Hinweis", () => {
  it("rechnet Tage drauf, auch über Monatsgrenzen", () => {
    expect(faelligkeitsDatum("2026-10-24", 14)).toBe("2026-11-07");
    expect(faelligkeitsDatum("2026-12-30", 7)).toBe("2027-01-06");
    expect(faelligkeitsDatum("2026-10-24", 0)).toBe("2026-10-24");
  });
  it("Hinweis nur bei Reverse-Charge", () => {
    expect(reverseChargeHinweis(false)).toBeNull();
    expect(reverseChargeHinweis(true)).toContain("USt-IdNr.");
  });
});
