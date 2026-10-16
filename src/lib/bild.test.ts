import { describe, expect, it } from "vitest";
import { fotoPfade, vorschauPfad, zielGroesse } from "./bild";

describe("zielGroesse", () => {
  it("verkleinert auf die längere Kante und behält das Seitenverhältnis", () => {
    expect(zielGroesse(4032, 3024, 1920)).toEqual({ breite: 1920, hoehe: 1440 });
    expect(zielGroesse(3024, 4032, 1920)).toEqual({ breite: 1440, hoehe: 1920 });
  });

  it("vergrößert nie", () => {
    expect(zielGroesse(800, 600, 1920)).toEqual({ breite: 800, hoehe: 600 });
  });
});

describe("fotoPfade", () => {
  it("legt Bild und Vorschau im Projektordner ab", () => {
    expect(fotoPfade("p1", "f1")).toEqual({ bild: "p1/f1.jpg", vorschau: "p1/f1_klein.jpg" });
    expect(vorschauPfad("p1/f1.jpg")).toBe("p1/f1_klein.jpg");
  });
});
