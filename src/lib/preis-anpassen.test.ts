import { describe, expect, it } from "vitest";
import { positionCent } from "./angebot";
import { preisAnpassen, zielAusZuschlag } from "./preis-anpassen";

const summe = (p: { menge: number; einzelpreis: number }[]) => p.reduce((s, x) => s + positionCent(x.menge, x.einzelpreis), 0) / 100;
const anwenden = (p: { id: string; menge: number; einzelpreis: number }[], neu: { id: string; einzelpreis: number }[]) =>
  p.map((x) => ({ ...x, einzelpreis: neu.find((n) => n.id === x.id)?.einzelpreis ?? x.einzelpreis }));

describe("preisAnpassen", () => {
  const pos = [
    { id: "a", menge: 100, einzelpreis: 8 }, // 800
    { id: "b", menge: 1, einzelpreis: 200 }, // 200
  ];

  it("hebt die Nettosumme um einen Faktor an und trifft das Ziel", () => {
    const r = preisAnpassen(pos, 1100)!;
    expect(r.rest).toBe(0);
    expect(summe(anwenden(pos, r.neuePreise))).toBe(1100);
    expect(r.neuePreise.find((n) => n.id === "a")!.einzelpreis).toBeCloseTo(8.8, 2);
  });

  it("senkt die Nettosumme", () => {
    const r = preisAnpassen(pos, 900)!;
    expect(summe(anwenden(pos, r.neuePreise))).toBe(900);
  });

  it("verteilt den Rundungsrest, sodass die Summe auf den Cent stimmt", () => {
    const krumm = [
      { id: "x", menge: 3, einzelpreis: 33.33 },
      { id: "y", menge: 7, einzelpreis: 12.34 },
      { id: "z", menge: 1, einzelpreis: 49.99 },
    ];
    const r = preisAnpassen(krumm, 777.77)!;
    expect(Math.abs(r.rest)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(summe(anwenden(krumm, r.neuePreise)) - 777.77)).toBeLessThanOrEqual(0.01);
  });

  it("trifft das Ziel auf den Cent, auch wenn nur eine Position mit Menge 1 den Rest ausgleichen kann", () => {
    const gemischt = [
      { id: "a", menge: 100, einzelpreis: 8 },
      { id: "b", menge: 1, einzelpreis: 200 },
      { id: "c", menge: 40, einzelpreis: 6.5 },
      { id: "d", menge: 12, einzelpreis: 18 },
    ];
    const r = preisAnpassen(gemischt, 1600)!;
    expect(r.rest).toBe(0);
    expect(summe(anwenden(gemischt, r.neuePreise))).toBe(1600);
  });

  it("ändert nichts, wenn das Ziel schon die Summe ist", () => {
    const r = preisAnpassen(pos, 1000)!;
    expect(r.neuePreise).toEqual([]);
    expect(r.rest).toBe(0);
  });

  it("lässt unbepreiste Positionen unberührt und lehnt unsinnige Ziele ab", () => {
    expect(preisAnpassen([{ id: "n", menge: 5, einzelpreis: 0 }], 100)).toBeNull();
    expect(preisAnpassen(pos, -5)).toBeNull();
    const r = preisAnpassen([...pos, { id: "frei", menge: 1, einzelpreis: 0 }], 1100)!;
    expect(r.neuePreise.some((n) => n.id === "frei")).toBe(false);
  });
});

describe("zielAusZuschlag", () => {
  it("rechnet Zuschlag und Abschlag", () => {
    expect(zielAusZuschlag(1000, 10)).toBe(1100);
    expect(zielAusZuschlag(1000, -5)).toBe(950);
  });
});
