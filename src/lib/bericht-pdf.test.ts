import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { BERICHT_ARTEN, BERICHT_ART_NAMEN } from "./bericht-arten";
import { leereDaten } from "./bericht";
import { berichtPdf, type BerichtPdfDaten } from "./bericht-pdf";
import { FIRMA_LEER } from "./firma";

const PERSON = "2b8f6e5c-2f0c-4a2e-9d57-2a1b3c4d5e6f";

const basis: BerichtPdfDaten = {
  firma: { ...FIRMA_LEER, name: "Maler Brinkmann", ort: "Saterland" },
  art: "bautagesbericht",
  titel: "Bautagesbericht",
  entwurf: false,
  datum: "2026-10-17",
  projektName: "Haus 2",
  projektnummer: "P-(2400)603",
  baustelle: "Hauptstraße 1, 26683 Saterland",
  kunde: "Müller GmbH\nDorfstraße 3, 26683 Saterland",
  daten: leereDaten("bautagesbericht", PERSON),
  personName: () => "Sebastian Plentner",
  fotos: new Map(),
  erstelltVon: "Sebastian Plentner",
  abgeschlossenAm: "17.10.2026, 16:09",
};

const seiten = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

function mitWerten(art: (typeof BERICHT_ARTEN)[number], werte: Record<string, unknown>): BerichtPdfDaten {
  const daten = leereDaten(art, PERSON);
  Object.assign(daten.werte, werte);
  return { ...basis, art, titel: BERICHT_ART_NAMEN[art], daten };
}

describe("berichtPdf", () => {
  it("erzeugt ein gültiges PDF ohne Fotos und Unterschrift", async () => {
    const bytes = await berichtPdf(basis);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    expect(await seiten(bytes)).toBe(1);
  });

  it("jede Berichtsart ergibt ein PDF (auch leer und als Entwurf)", async () => {
    for (const art of BERICHT_ARTEN) {
      const bytes = await berichtPdf({ ...mitWerten(art, {}), entwurf: true, kunde: "" });
      expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    }
  });

  it("kommt mit Sonderzeichen, Listen, Checkliste und kaputten Bildern zurecht", async () => {
    const bytes = await berichtPdf({
      ...mitWerten("regiebericht", {
        material: "Emoji 🎨 und „Anführungszeichen“ – Tab\tund\nZeilen",
        mitarbeiter: [{ person: PERSON, stunden: 7.5, leistung: "Streichen" }],
        materialien: [{ bezeichnung: "Farbe weiß", menge: 3, einheit: "Eimer" }],
        bilder: ["a"],
      }),
      entwurf: true,
      fotos: new Map([["a", new Uint8Array([1, 2, 3])]]),
      unterschrift: { name: "Frau Ö", wann: "17.10.2026", bild: new Uint8Array([1, 2, 3]) },
    });
    expect(await seiten(bytes)).toBe(1);

    const check = await berichtPdf(mitWerten("checkliste", { checkliste: ["aufmass"] }));
    expect(String.fromCharCode(...check.slice(0, 5))).toBe("%PDF-");
  });

  it("macht bei langem Text neue Seiten", async () => {
    const bytes = await berichtPdf(mitWerten("bautagesbericht", { leistungen: "Wohnzimmer Wände zweimal gestrichen. ".repeat(400) }));
    expect(await seiten(bytes)).toBeGreaterThan(1);
  });
});
