import { describe, expect, it } from "vitest";
import { vkBerechnen } from "./katalog";
import { STANDARD_EINSTELLUNGEN, effektiverZuschlag, kalkulieren, lohnZuschlagProzent, type KalkulationEingabe } from "./kalkulation";

const leer: KalkulationEingabe = { lohngruppeId: "standard", lohnMinuten: 0, material: 0, geraete: 0, fremdleistung: 0, sonstiges: 0 };

describe("Lohn-Zuschlag aus der Lohngruppe", () => {
  it("47,50 € Verrechnungssatz auf 24,88 € Lohnkosten sind 90,92 %", () => {
    expect(lohnZuschlagProzent({ lohnkosten: 24.88, verrechnungssatz: 47.5 })).toBe(90.92);
    expect(lohnZuschlagProzent({ lohnkosten: 0, verrechnungssatz: 47.5 })).toBe(0);
  });
});

describe("kalkulieren", () => {
  it("nur Lohn: Minuten ÷ 60 × Verrechnungssatz", () => {
    const r = kalkulieren({ ...leer, lohnMinuten: 30 }, STANDARD_EINSTELLUNGEN);
    expect(r.ek.lohn).toBe(12.44); // 0,5 h × 24,88
    expect(r.vk.lohn).toBe(23.75); // 0,5 h × 47,50
    expect(r.ekGesamt).toBe(12.44);
    expect(r.vkGesamt).toBe(23.75);
  });

  it("jede Kostenart mit ihrem eigenen Zuschlag (Material 40 %, Geräte 5 %, Fremd 0 %, Sonstiges 3 %)", () => {
    const r = kalkulieren({ ...leer, material: 10, geraete: 10, fremdleistung: 10, sonstiges: 10 }, STANDARD_EINSTELLUNGEN);
    expect(r.vk).toMatchObject({ material: 14, geraete: 10.5, fremdleistung: 10, sonstiges: 10.3 });
    expect(r.ekGesamt).toBe(40);
    expect(r.vkGesamt).toBe(44.8);
  });

  it("Beispiel: 12 Minuten Lohn + 3,20 € Material je m²", () => {
    const r = kalkulieren({ ...leer, lohnMinuten: 12, material: 3.2 }, STANDARD_EINSTELLUNGEN);
    expect(r.ek.lohn).toBe(4.976); // 0,2 h × 24,88
    expect(r.vk.lohn).toBe(9.5);
    expect(r.vk.material).toBe(4.48);
    expect(r.ekGesamt).toBe(8.176);
    expect(r.vkGesamt).toBe(13.98);
  });

  it("der gespeicherte Zuschlag führt in der Datenbankformel genau auf den kalkulierten Preis (bis etwa 100 € Kosten je Einheit)", () => {
    const eingaben: Partial<KalkulationEingabe>[] = [
      { lohnMinuten: 12, material: 3.2 },
      { lohnMinuten: 7, material: 1.37, geraete: 0.45 },
      { lohnMinuten: 95, sonstiges: 2.2, fremdleistung: 11.11 },
      { material: 0.01 },
      { lohnMinuten: 1 },
      { lohnMinuten: 120, material: 20, geraete: 7.77, sonstiges: 9.99 },
    ];
    for (const e of eingaben) {
      const r = kalkulieren({ ...leer, ...e }, STANDARD_EINSTELLUNGEN);
      expect(r.ekGesamt).toBeGreaterThan(0);
      expect(r.vkGespeichert).toBe(vkBerechnen(r.ekGesamt, r.zuschlagProzent));
      expect(r.vkGespeichert).toBe(r.vkGesamt);
    }
  });

  it("bei sehr hohen Kosten (ein Zehntausendstel Zuschlag ist dann mehr als ein Cent) weicht der gespeicherte Preis etwas ab, aber nie um mehr als einen Schritt", () => {
    for (const e of [{ lohnMinuten: 333, material: 123.45, geraete: 17.77, fremdleistung: 5, sonstiges: 9.99 }, { lohnMinuten: 2000, material: 999.99 }]) {
      const r = kalkulieren({ ...leer, ...e }, STANDARD_EINSTELLUNGEN);
      expect(Math.abs(r.vkGespeichert - r.vkGesamt)).toBeLessThanOrEqual(r.ekGesamt * 0.0001 + 0.01);
    }
  });

  it("unbekannte Lohngruppe nimmt die erste, ohne Lohngruppe gibt es keinen Lohn", () => {
    expect(kalkulieren({ ...leer, lohngruppeId: "gibt-es-nicht", lohnMinuten: 60 }, STANDARD_EINSTELLUNGEN).vk.lohn).toBe(47.5);
    expect(kalkulieren({ ...leer, lohnMinuten: 60 }, { ...STANDARD_EINSTELLUNGEN, lohngruppen: [] }).vkGesamt).toBe(0);
  });
});

describe("effektiverZuschlag", () => {
  it("ohne Kosten oder ohne Aufschlag 0", () => {
    expect(effektiverZuschlag(0, 5)).toBe(0);
    expect(effektiverZuschlag(10, 10)).toBe(0);
  });
  it("trifft den Cent", () => {
    expect(vkBerechnen(8.176, effektiverZuschlag(8.176, 13.98))).toBe(13.98);
    expect(effektiverZuschlag(10, 14)).toBe(40);
  });
});
