import { describe, expect, it } from "vitest";
import { benachrichtigungenLesen, initialen, profilSchema } from "./profil";

describe("benachrichtigungenLesen", () => {
  it("schaltet alles ein, was fehlt", () => {
    expect(benachrichtigungenLesen({})).toEqual({ projekt_zugewiesen: true, chat: true, arbeitszeit: true, urlaub: true });
    expect(benachrichtigungenLesen(null).chat).toBe(true);
  });
  it("übernimmt ausgeschaltete Werte", () => {
    expect(benachrichtigungenLesen({ chat: false, urlaub: true }).chat).toBe(false);
    expect(benachrichtigungenLesen({ chat: false }).urlaub).toBe(true);
  });
  it("ignoriert Unsinn", () => {
    expect(benachrichtigungenLesen([1, 2]).chat).toBe(true);
    expect(benachrichtigungenLesen("x").chat).toBe(true);
  });
});

describe("profilSchema", () => {
  it("verlangt einen Vornamen", () => {
    expect(profilSchema.safeParse({ vorname: " ", nachname: "", telefon: "" }).success).toBe(false);
  });
  it("schneidet Leerzeichen ab", () => {
    const p = profilSchema.parse({ vorname: " Mika ", nachname: " B ", telefon: " 0171 1 " });
    expect(p).toEqual({ vorname: "Mika", nachname: "B", telefon: "0171 1" });
  });
});

describe("initialen", () => {
  it("nimmt die ersten Buchstaben", () => {
    expect(initialen("mika", "Brinkmann")).toBe("MB");
    expect(initialen("Ralf", "")).toBe("R");
    expect(initialen("", "")).toBe("?");
  });
});
