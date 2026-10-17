import { describe, expect, it } from "vitest";
import { rechnungBausteinPruefen, rechnungKopfSchema } from "./rechnung-schema";

const ok = {
  betreff: "Haus 2", rechnungsdatum: "2026-10-18", leistungVon: "2026-09-01", leistungBis: "2026-10-15", zahlungsziel: "14",
  skontoProzent: "", skontoTage: "", steuer: "rc", rabatt: "", einleitung: "", schlusstext: "",
};

describe("rechnungKopfSchema", () => {
  it("nimmt gültige Eingaben und wandelt Zahlen um", () => {
    const r = rechnungKopfSchema.parse(ok);
    expect([r.zahlungsziel, r.skontoProzent, r.skontoTage, r.rabatt, r.steuer]).toEqual([14, null, null, 0, "rc"]);
    expect(rechnungKopfSchema.parse({ ...ok, skontoProzent: "2,5", skontoTage: "7", rabatt: "3" })).toMatchObject({ skontoProzent: 2.5, skontoTage: 7, rabatt: 3 });
  });
  it("prüft Daten, Leistungszeitraum, Zahlungsziel und Skonto", () => {
    expect(rechnungKopfSchema.safeParse({ ...ok, betreff: " " }).success).toBe(false);
    expect(rechnungKopfSchema.safeParse({ ...ok, rechnungsdatum: "18.10.2026" }).success).toBe(false);
    expect(rechnungKopfSchema.safeParse({ ...ok, leistungBis: "2026-08-01" }).success).toBe(false);
    expect(rechnungKopfSchema.safeParse({ ...ok, zahlungsziel: "-1" }).success).toBe(false);
    expect(rechnungKopfSchema.safeParse({ ...ok, zahlungsziel: "14,5" }).success).toBe(false);
    expect(rechnungKopfSchema.safeParse({ ...ok, skontoProzent: "2" }).success).toBe(false);
    expect(rechnungKopfSchema.safeParse({ ...ok, skontoProzent: "25", skontoTage: "7" }).success).toBe(false);
    expect(rechnungKopfSchema.safeParse({ ...ok, rabatt: "101" }).success).toBe(false);
    expect(rechnungKopfSchema.safeParse({ ...ok, steuer: "16" }).success).toBe(false);
  });
});

describe("rechnungBausteinPruefen", () => {
  it("Position wie im Angebot, Textzeile mit Kurz- oder Langtext", () => {
    expect(rechnungBausteinPruefen({ typ: "position", kurztext: "Wände", menge: "313,63", einheit: "m²", einzelpreis: "11,80" })).toEqual({
      daten: { typ: "position", kurztext: "Wände", langtext: "", menge: 313.63, einheit: "m²", einzelpreis: 11.8 },
    });
    expect(rechnungBausteinPruefen({ typ: "text", kurztext: "Wohnzimmer" })).toMatchObject({ daten: { typ: "text", kurztext: "Wohnzimmer" } });
    expect("fehler" in rechnungBausteinPruefen({ typ: "text" })).toBe(true);
    expect("fehler" in rechnungBausteinPruefen({ typ: "zwischensumme" })).toBe(true);
    expect("fehler" in rechnungBausteinPruefen({ typ: "position", kurztext: "x", menge: "abc", einheit: "m", einzelpreis: "1" })).toBe(true);
  });
});
