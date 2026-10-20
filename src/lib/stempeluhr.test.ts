import { describe, expect, it } from "vitest";
import { STANDARD_EINSTELLUNGEN } from "@/lib/zeiten";
import { berlinZeit, laufzeitText, stempelEintrag } from "./stempeluhr";

const E = STANDARD_EINSTELLUNGEN;

describe("berlinZeit", () => {
  it("rechnet UTC in deutsche Zeit um (Sommer- und Winterzeit)", () => {
    expect(berlinZeit(new Date("2026-07-01T04:30:00Z"))).toEqual({ datum: "2026-07-01", uhrzeit: "06:30" });
    expect(berlinZeit(new Date("2026-12-01T05:30:00Z"))).toEqual({ datum: "2026-12-01", uhrzeit: "06:30" });
    expect(berlinZeit(new Date("2026-10-20T22:30:00Z"))).toEqual({ datum: "2026-10-21", uhrzeit: "00:30" });
  });
});

describe("stempelEintrag", () => {
  it("langer Tag: Standardpause (Dienstag 45 Min)", () => {
    // 20.10.2026 ist ein Dienstag, MESZ endete am 25.10., also +2
    const r = stempelEintrag(new Date("2026-10-20T04:30:00Z"), new Date("2026-10-20T13:45:00Z"), E, false);
    expect(r).toEqual({ datum: "2026-10-20", von: "06:30", bis: "15:45", pauseMin: E.standardPauseMin, hinweis: "" });
  });

  it("Freitag hat die kurze Pause", () => {
    const r = stempelEintrag(new Date("2026-10-23T04:30:00Z"), new Date("2026-10-23T10:45:00Z"), E, false);
    expect(r).toMatchObject({ von: "06:30", bis: "12:45", pauseMin: E.freitagPauseMin });
  });

  it("kurzer Einsatz: keine Pause", () => {
    const r = stempelEintrag(new Date("2026-10-20T05:00:00Z"), new Date("2026-10-20T08:00:00Z"), E, false);
    expect(r).toMatchObject({ pauseMin: 0 });
  });

  it("keine zweite Pause am selben Tag", () => {
    const r = stempelEintrag(new Date("2026-10-20T04:30:00Z"), new Date("2026-10-20T13:45:00Z"), E, true);
    expect(r).toMatchObject({ pauseMin: 0 });
  });

  it("unter einer Minute: Fehler", () => {
    const r = stempelEintrag(new Date("2026-10-20T05:00:10Z"), new Date("2026-10-20T05:00:40Z"), E, false);
    expect(r).toHaveProperty("fehler");
  });

  it("über Mitternacht: endet um 23:59 mit Hinweis", () => {
    const r = stempelEintrag(new Date("2026-10-20T14:00:00Z"), new Date("2026-10-21T03:00:00Z"), E, false);
    expect(r).toMatchObject({ datum: "2026-10-20", von: "16:00", bis: "23:59" });
    expect((r as { hinweis: string }).hinweis).toContain("Mitternacht");
  });
});

describe("laufzeitText", () => {
  it("formatiert H:MM:SS", () => {
    expect(laufzeitText(0)).toBe("0:00:00");
    expect(laufzeitText(61_000)).toBe("0:01:01");
    expect(laufzeitText(3_725_000)).toBe("1:02:05");
    expect(laufzeitText(-5)).toBe("0:00:00");
  });
});
