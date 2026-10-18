import { describe, expect, it } from "vitest";
import { bearbeitetText, personKreis, zeitraumText } from "./listen-anzeige";

describe("zeitraumText (wie in der Plancraft-Projektliste)", () => {
  it("einzelne und fehlende Daten", () => {
    expect(zeitraumText(null, null)).toBe("–");
    expect(zeitraumText("2026-10-13", null)).toBe("13.10.2026");
    expect(zeitraumText("2026-10-13", "2026-10-13")).toBe("13.10.2026");
    expect(zeitraumText(null, "2026-05-25")).toBe("25.05.2026");
  });
  it("gleicher Monat, gleiches Jahr, verschiedene Jahre", () => {
    expect(zeitraumText("2026-05-07", "2026-05-25")).toBe("07.–25.05.2026");
    expect(zeitraumText("2026-07-08", "2026-09-08")).toBe("08.07. – 08.09.2026");
    expect(zeitraumText("2026-12-20", "2027-01-10")).toBe("20.12.2026 – 10.01.2027");
  });
});

describe("bearbeitetText", () => {
  const jetzt = new Date("2026-10-18T14:00:00+02:00");
  it("Heute, Gestern und älter mit Wochentag", () => {
    expect(bearbeitetText("2026-10-18T15:48:00+02:00", jetzt)).toBe("Heute · 15:48");
    expect(bearbeitetText("2026-10-17T11:17:00+02:00", jetzt)).toBe("Gestern · 11:17");
    expect(bearbeitetText("2026-10-16T09:14:00+02:00", jetzt)).toBe("Fr., 16.10.2026 · 09:14");
    expect(bearbeitetText(null, jetzt)).toBe("–");
  });
});

describe("personKreis", () => {
  it("Initialen aus Vor- und Nachname, feste Farbe", () => {
    expect(personKreis("Ralf Brinkmann").initialen).toBe("RB");
    expect(personKreis("Lena Eigenmeier").initialen).toBe("LE");
    expect(personKreis("Cher").initialen).toBe("C");
    expect(personKreis("Ralf Brinkmann").farbe).toBe(personKreis("Ralf Brinkmann").farbe);
    expect(personKreis("").initialen).toBe("?");
  });
});
