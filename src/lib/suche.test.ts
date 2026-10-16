import { describe, expect, it } from "vitest";
import { suchtext } from "./suche";

describe("suchtext", () => {
  it("entfernt Zeichen, die den Filter durcheinanderbringen (Komma, Klammern, Prozent)", () => {
    expect(suchtext("Müller, (Hans) %_")).toBe("Müller Hans");
    expect(suchtext("  KD-241350  ")).toBe("KD-241350");
    expect(suchtext("a".repeat(100))).toHaveLength(60);
  });
});
