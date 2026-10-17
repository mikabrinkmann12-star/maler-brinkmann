import { describe, expect, it } from "vitest";
import { berichtAbschliessenSchema, berichtSpeichernSchema, datenLesen, istGezeichnet, unterschriftPfad, wetterText } from "./bericht";

const P = "0b8f6e5c-2f0c-4a2e-9d57-2a1b3c4d5e6f";
const B = "1b8f6e5c-2f0c-4a2e-9d57-2a1b3c4d5e6f";
const U = "2b8f6e5c-2f0c-4a2e-9d57-2a1b3c4d5e6f";

describe("berichtSpeichernSchema", () => {
  const basis = { id: B, projektId: P, art: "bautagesbericht", datum: "2026-10-17" };
  it("nimmt einen vollständigen Bericht und füllt Leerwerte auf", () => {
    const r = berichtSpeichernSchema.safeParse({ ...basis, daten: { wetter: "regen", temperatur: 7, personal: [U], arbeiten: " Decke gestrichen " } });
    expect(r.success && r.data.daten).toMatchObject({ wetter: "regen", temperatur: 7, personal: [U], arbeiten: "Decke gestrichen", besonderheiten: "", fotos: [] });
    expect(berichtSpeichernSchema.safeParse({ ...basis, daten: {} }).success).toBe(true);
  });
  it("lehnt unbekannte Art, falsches Datum, falsche Temperatur und zu viele Fotos ab", () => {
    expect(berichtSpeichernSchema.safeParse({ ...basis, art: "irgendwas", daten: {} }).success).toBe(false);
    expect(berichtSpeichernSchema.safeParse({ ...basis, datum: "17.10.2026", daten: {} }).success).toBe(false);
    expect(berichtSpeichernSchema.safeParse({ ...basis, daten: { temperatur: 99 } }).success).toBe(false);
    expect(berichtSpeichernSchema.safeParse({ ...basis, daten: { temperatur: 12.5 } }).success).toBe(false);
    expect(berichtSpeichernSchema.safeParse({ ...basis, daten: { fotos: Array(9).fill(U) } }).success).toBe(false);
    expect(berichtSpeichernSchema.safeParse({ ...basis, daten: { wetter: "gewitter" } }).success).toBe(false);
  });
});

describe("berichtAbschliessenSchema", () => {
  it("Unterschrift ist optional, mit Unterschrift braucht sie einen Namen", () => {
    expect(berichtAbschliessenSchema.safeParse({ id: B, projektId: P }).success).toBe(true);
    expect(berichtAbschliessenSchema.safeParse({ id: B, projektId: P, unterschrift: { name: " Herr Müller " } }).data?.unterschrift?.name).toBe("Herr Müller");
    expect(berichtAbschliessenSchema.safeParse({ id: B, projektId: P, unterschrift: { name: "  " } }).success).toBe(false);
  });
});

describe("Hilfen", () => {
  it("unterschriftPfad", () => expect(unterschriftPfad(P, B)).toBe(`${P}/${B}.png`));
  it("wetterText", () => {
    expect(wetterText("sonnig", 14)).toBe("Sonnig, 14 °C");
    expect(wetterText(null, -2)).toBe("-2 °C");
    expect(wetterText(null, null)).toBe("");
  });
  it("datenLesen übersteht kaputte Daten", () => {
    expect(datenLesen(null).arbeiten).toBe("");
    const d = datenLesen({ wetter: "ufo", temperatur: 3, arbeiten: "ok", fotos: "kaputt" });
    expect(d).toMatchObject({ wetter: null, temperatur: 3, arbeiten: "ok", fotos: [] });
  });
  it("istGezeichnet erkennt leere Zeichenflächen", () => {
    expect(istGezeichnet(new Uint8Array(1000))).toBe(false);
    const a = new Uint8Array(1000);
    for (let i = 0; i < 20; i++) a[i] = 255;
    expect(istGezeichnet(a)).toBe(true);
    expect(istGezeichnet([])).toBe(false);
  });
});
