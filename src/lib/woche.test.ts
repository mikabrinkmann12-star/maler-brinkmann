import { describe, expect, it } from "vitest";
import { tagesTitel, tagZahl, wochenstart, wochenTage, wochenTitel, wochentagNr } from "./woche";

describe("woche", () => {
  it("Montag ist 0, Sonntag 6", () => {
    expect(wochentagNr("2026-10-19")).toBe(0); // Montag
    expect(wochentagNr("2026-10-20")).toBe(1);
    expect(wochentagNr("2026-10-25")).toBe(6); // Sonntag
  });

  it("findet den Montag und die sieben Tage", () => {
    expect(wochenstart("2026-10-20")).toBe("2026-10-19");
    expect(wochenstart("2026-10-25")).toBe("2026-10-19");
    expect(wochenstart("2026-10-19")).toBe("2026-10-19");
    const t = wochenTage("2026-10-22");
    expect(t[0]).toBe("2026-10-19");
    expect(t[6]).toBe("2026-10-25");
    expect(t).toHaveLength(7);
  });

  it("Wochentitel auch über Monatsgrenzen", () => {
    expect(wochenTitel("2026-10-19")).toBe("19.–25. Okt.");
    expect(wochenTitel("2026-10-26")).toMatch(/^26\. Okt\.–1\. Nov\.$/);
  });

  it("Tagestitel", () => {
    expect(tagesTitel("2026-10-20", "2026-10-20")).toBe("Heute, 20. Okt. 2026");
    expect(tagesTitel("2026-10-21", "2026-10-20")).toBe("Morgen, 21. Okt. 2026");
    expect(tagesTitel("2026-10-19", "2026-10-20")).toBe("Gestern, 19. Okt. 2026");
    expect(tagesTitel("2026-10-23", "2026-10-20")).toBe("Fr., 23. Okt. 2026");
  });

  it("Tageszahl", () => {
    expect(tagZahl("2026-10-05")).toBe(5);
  });
});
