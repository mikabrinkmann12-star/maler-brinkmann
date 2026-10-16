import { describe, expect, it } from "vitest";
import { kennzeichenNormalisieren } from "./fahrzeug";

describe("kennzeichenNormalisieren", () => {
  it("schreibt deutsche Kennzeichen einheitlich", () => {
    expect(kennzeichenNormalisieren("clp de 101")).toBe("CLP-DE 101");
    expect(kennzeichenNormalisieren(" CLP-DE101 ")).toBe("CLP-DE 101");
    expect(kennzeichenNormalisieren("Clp  d 5")).toBe("CLP-D 5");
    expect(kennzeichenNormalisieren("clp-ab 123e")).toBe("CLP-AB 123E");
    expect(kennzeichenNormalisieren("ä-ab 12")).toBe("Ä-AB 12");
  });

  it("nimmt Ungewöhnliches an, wenn es nur harmlose Zeichen enthält", () => {
    expect(kennzeichenNormalisieren("sprinter 3")).toBe("SPRINTER 3");
  });

  it("lehnt Unbrauchbares ab", () => {
    expect(kennzeichenNormalisieren("")).toBeNull();
    expect(kennzeichenNormalisieren("ab")).toBeNull();
    expect(kennzeichenNormalisieren("CLP<script>")).toBeNull();
    expect(kennzeichenNormalisieren("-CLP-DE 1")).toBeNull();
    expect(kennzeichenNormalisieren("A".repeat(20))).toBeNull();
  });
});
