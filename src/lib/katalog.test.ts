import { describe, expect, it } from "vitest";
import {
  nachfahrenIds,
  ordnerBaum,
  ordnerMitNachfahren,
  ordnerOptionen,
  ordnerPfad,
  ordnerPfadText,
  preisFuerFeld,
  preisLesen,
  unterordner,
  vkBerechnen,
  zuschlagLesen,
} from "./katalog";

describe("preisLesen", () => {
  it("liest deutsche und englische Schreibweisen", () => {
    expect(preisLesen("12,5")).toBe(12.5);
    expect(preisLesen("12,50 €")).toBe(12.5);
    expect(preisLesen("1.234,56")).toBe(1234.56);
    expect(preisLesen("12.50")).toBe(12.5);
    expect(preisLesen("0,1234")).toBe(0.1234);
    expect(preisLesen("7")).toBe(7);
    expect(preisLesen("0")).toBe(0);
  });
  it("Punkt mit genau drei Ziffern ohne Komma ist ein Tausendertrenner", () => {
    expect(preisLesen("1.234")).toBe(1234);
    expect(preisLesen("1.234.567")).toBe(1234567);
    expect(preisLesen("12.5")).toBe(12.5);
  });
  it("Unlesbares, Negatives und zu viele Nachkommastellen sind null", () => {
    for (const t of ["", "abc", "-5", "1,2,3", "12,34567", "1..2", "1.2.3", "12,"]) expect(preisLesen(t)).toBeNull();
  });
});

describe("zuschlagLesen", () => {
  it("liest Prozent mit Komma oder Punkt", () => {
    expect(zuschlagLesen("25")).toBe(25);
    expect(zuschlagLesen("12,5 %")).toBe(12.5);
    expect(zuschlagLesen("0")).toBe(0);
    expect(zuschlagLesen("999")).toBe(999);
  });
  it("lehnt Unsinn, Negatives und zu große Werte ab", () => {
    for (const t of ["", "abc", "-1", "1000", "12,345"]) expect(zuschlagLesen(t)).toBeNull();
  });
});

describe("vkBerechnen", () => {
  it("EK × (1 + Zuschlag), auf Cent gerundet", () => {
    expect(vkBerechnen(10, 25)).toBe(12.5);
    expect(vkBerechnen(100, 0)).toBe(100);
    expect(vkBerechnen(19.99, 30)).toBe(25.99); // 25,987
    expect(vkBerechnen(0, 50)).toBe(0);
  });
  it("0,5 Cent rundet auf (wie round() in Postgres)", () => {
    expect(vkBerechnen(0.1, 5)).toBe(0.11); // 0,105
    expect(vkBerechnen(0.01, 50)).toBe(0.02); // 0,015
    expect(vkBerechnen(1.005, 0)).toBe(1.01);
  });
  it("kein Fließkomma-Fehler und Preise mit 4 Nachkommastellen", () => {
    expect(vkBerechnen(0.29, 100)).toBe(0.58);
    expect(vkBerechnen(12.3456, 10)).toBe(13.58); // 13,58016
    expect(vkBerechnen(1000000, 999)).toBe(10990000);
  });
});

describe("preisFuerFeld", () => {
  it("mindestens 2, höchstens 4 Nachkommastellen mit Komma", () => {
    expect(preisFuerFeld(12.5)).toBe("12,50");
    expect(preisFuerFeld(7)).toBe("7,00");
    expect(preisFuerFeld(0.1234)).toBe("0,1234");
    expect(preisFuerFeld(1234.5)).toBe("1234,50");
  });
  it("lässt sich mit preisLesen wieder einlesen", () => {
    for (const w of [0, 12.5, 0.1234, 1234.56]) expect(preisLesen(preisFuerFeld(w))).toBe(w);
  });
});

describe("Ordner", () => {
  const ordner = [
    { id: "farben", parentId: null, name: "Farben" },
    { id: "disp", parentId: "farben", name: "Dispersion" },
    { id: "lack", parentId: "farben", name: "Lacke" },
    { id: "weiss", parentId: "disp", name: "Weiß" },
    { id: "tapeten", parentId: null, name: "Tapeten" },
  ];

  it("unterordner: alphabetisch, nur die direkten", () => {
    expect(unterordner(ordner, null).map((o) => o.name)).toEqual(["Farben", "Tapeten"]);
    expect(unterordner(ordner, "farben").map((o) => o.name)).toEqual(["Dispersion", "Lacke"]);
    expect(unterordner(ordner, "weiss")).toEqual([]);
  });

  it("ordnerPfad: vom obersten Ordner bis zum gewählten", () => {
    expect(ordnerPfad(ordner, "weiss").map((o) => o.name)).toEqual(["Farben", "Dispersion", "Weiß"]);
    expect(ordnerPfadText(ordner, "weiss")).toBe("Farben › Dispersion › Weiß");
    expect(ordnerPfad(ordner, null)).toEqual([]);
    expect(ordnerPfad(ordner, "gibt-es-nicht")).toEqual([]);
  });

  it("ordnerPfad hängt bei kaputten Daten (Schleife) nicht", () => {
    const kaputt = [{ id: "a", parentId: "b", name: "A" }, { id: "b", parentId: "a", name: "B" }];
    expect(ordnerPfad(kaputt, "a").length).toBeLessThanOrEqual(50);
  });

  it("nachfahrenIds: alle Ebenen, ohne den Ordner selbst", () => {
    expect(nachfahrenIds(ordner, "farben").sort()).toEqual(["disp", "lack", "weiss"]);
    expect(nachfahrenIds(ordner, "tapeten")).toEqual([]);
  });

  it("ordnerBaum: Zahl eines Ordners schließt die Unterordner ein", () => {
    const baum = ordnerBaum(ordner, new Map([["farben", 1], ["disp", 2], ["weiss", 4], ["tapeten", 3]]));
    expect(baum.map((k) => [k.name, k.eigene, k.gesamt])).toEqual([["Farben", 1, 7], ["Tapeten", 3, 3]]);
    expect(baum[0].kinder.map((k) => [k.name, k.gesamt])).toEqual([["Dispersion", 6], ["Lacke", 0]]);
    expect(baum[0].kinder[0].kinder.map((k) => k.name)).toEqual(["Weiß"]);
  });

  it("ordnerMitNachfahren: der Ordner selbst und alles darunter", () => {
    expect(ordnerMitNachfahren(ordner, "disp").sort()).toEqual(["disp", "weiss"]);
    expect(ordnerMitNachfahren(ordner, "tapeten")).toEqual(["tapeten"]);
  });

  it("ordnerOptionen: nach Pfad sortiert; beim Verschieben fehlen der Ordner und seine Unterordner", () => {
    expect(ordnerOptionen(ordner).map((o) => o.text)).toEqual([
      "Farben", "Farben › Dispersion", "Farben › Dispersion › Weiß", "Farben › Lacke", "Tapeten",
    ]);
    expect(ordnerOptionen(ordner, "disp").map((o) => o.id)).toEqual(["farben", "lack", "tapeten"]);
  });
});
