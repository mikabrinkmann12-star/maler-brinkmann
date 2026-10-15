import { describe, expect, it } from "vitest";
import { EIGENE_VERSION, istNeueVersion } from "./pwa";

describe("istNeueVersion", () => {
  it("meldet keine neue Version, wenn Server und Seite gleich sind", () => {
    expect(istNeueVersion(EIGENE_VERSION)).toBe(false);
  });

  it("meldet eine neue Version, wenn der Server eine andere Kennung hat", () => {
    expect(istNeueVersion("dpl_neue-version-123")).toBe(true);
  });

  it("ignoriert leere oder kaputte Antworten (kein falscher Hinweis)", () => {
    expect(istNeueVersion("")).toBe(false);
    expect(istNeueVersion(undefined)).toBe(false);
    expect(istNeueVersion(null)).toBe(false);
    expect(istNeueVersion(42)).toBe(false);
  });
});
