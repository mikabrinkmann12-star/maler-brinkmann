import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { berichtPdf, type BerichtPdfDaten } from "./bericht-pdf";
import { FIRMA_LEER } from "./firma";

const basis: BerichtPdfDaten = {
  firma: { ...FIRMA_LEER, name: "Maler Brinkmann", ort: "Saterland" },
  titel: "Bautagesbericht",
  entwurf: false,
  datum: "2026-10-17",
  projektName: "Haus 2",
  projektnummer: "P-(2600)448",
  baustelle: "Hauptstraße 1, 26683 Saterland",
  kunde: "Müller GmbH",
  wetter: "Regen, 9 °C",
  anwesend: ["Sebastian Plentner"],
  arbeiten: "Wände gestrichen.",
  besonderheiten: "",
  fotos: [],
  erstelltVon: "Sebastian Plentner",
  abgeschlossenAm: "17.10.2026, 16:09",
};

const seiten = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe("berichtPdf", () => {
  it("erzeugt ein gültiges PDF ohne Fotos und Unterschrift", async () => {
    const bytes = await berichtPdf(basis);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    expect(await seiten(bytes)).toBe(1);
  });

  it("kommt mit Sonderzeichen, leeren Angaben und kaputten Bildern zurecht", async () => {
    const bytes = await berichtPdf({
      ...basis,
      entwurf: true,
      arbeiten: "Emoji 🎨 und „Anführungszeichen“ – Tab\tund\nZeilen",
      anwesend: [],
      kunde: "",
      wetter: "",
      fotos: [new Uint8Array([1, 2, 3])],
      unterschrift: { name: "Frau Ö", wann: "17.10.2026", bild: new Uint8Array([1, 2, 3]) },
    });
    expect(await seiten(bytes)).toBe(1);
  });

  it("macht bei langem Text neue Seiten", async () => {
    const bytes = await berichtPdf({ ...basis, arbeiten: "Wohnzimmer Wände zweimal gestrichen. ".repeat(400) });
    expect(await seiten(bytes)).toBeGreaterThan(1);
  });
});
