import { describe, expect, it } from "vitest";
import { wetterAusAntwort, wetterCode } from "./wetter";

describe("wetterCode", () => {
  it("übersetzt die wichtigsten Codes ins Deutsche", () => {
    expect(wetterCode(0).text).toBe("Klar");
    expect(wetterCode(3).text).toBe("Bewölkt");
    expect(wetterCode(63).text).toBe("Regen");
    expect(wetterCode(95).text).toBe("Gewitter");
    expect(wetterCode(1234).text).toBe("Gewitter"); // ab 95 immer Gewitter
  });
});

describe("wetterAusAntwort", () => {
  it("rundet und nimmt die nächsten Stunden mit", () => {
    const w = wetterAusAntwort({
      current: { temperature_2m: 11.6, weather_code: 3 },
      hourly: { time: ["2026-10-18T17:00", "2026-10-18T18:00"], temperature_2m: [11.4, 10.6], weather_code: [3, 61] },
      daily: { temperature_2m_min: [8.7], temperature_2m_max: [12.2] },
    });
    expect(w).toMatchObject({ ort: "Saterland", grad: 12, minGrad: 9, maxGrad: 12, text: "Bewölkt" });
    expect(w?.stunden).toEqual([
      { uhrzeit: "17:00", grad: 11, symbol: "☁️", text: "Bewölkt" },
      { uhrzeit: "18:00", grad: 11, symbol: "🌧️", text: "Regen" },
    ]);
  });

  it("ohne aktuelle Werte oder bei kaputten Antworten gibt es null", () => {
    expect(wetterAusAntwort(null)).toBeNull();
    expect(wetterAusAntwort({})).toBeNull();
    expect(wetterAusAntwort({ current: { temperature_2m: 5 } })).toBeNull();
  });

  it("übersteht fehlende Stunden- und Tageswerte", () => {
    const w = wetterAusAntwort({ current: { temperature_2m: 7, weather_code: 0 }, hourly: { time: ["2026-10-18T17:00"] } });
    expect(w?.stunden).toEqual([]);
    expect(w?.minGrad).toBe(7);
  });
});
