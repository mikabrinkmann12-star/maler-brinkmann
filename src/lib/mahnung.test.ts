import { describe, expect, it } from "vitest";
import { istMahnstufe, mahnstufeName } from "./mahnung";

describe("Mahnstufen", () => {
  it("Namen und gültige Werte", () => {
    expect(mahnstufeName(0)).toBe("Nicht gemahnt");
    expect(mahnstufeName(1)).toBe("Zahlungserinnerung");
    expect(mahnstufeName(2)).toBe("1. Mahnung");
    expect(mahnstufeName(3)).toBe("2. Mahnung");
    expect(mahnstufeName(9)).toBe("Nicht gemahnt");
    expect([0, 1, 2, 3].every(istMahnstufe)).toBe(true);
    expect(istMahnstufe(4)).toBe(false);
    expect(istMahnstufe("1")).toBe(false);
  });
});
