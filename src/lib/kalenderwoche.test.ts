import { describe, expect, it } from "vitest";
import { kalenderwoche } from "./kalenderwoche";

describe("kalenderwoche", () => {
  it("ISO-Wochen", () => {
    expect(kalenderwoche("2026-10-20")).toBe(43);
    expect(kalenderwoche("2026-10-19")).toBe(43);
    expect(kalenderwoche("2026-10-25")).toBe(43);
    expect(kalenderwoche("2026-01-01")).toBe(1);
    expect(kalenderwoche("2026-12-31")).toBe(53);
    expect(kalenderwoche("2027-01-01")).toBe(53);
    expect(kalenderwoche("2027-01-04")).toBe(1);
  });
});
