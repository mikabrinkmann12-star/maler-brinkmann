import { describe, expect, it } from "vitest";
import { chatSumme, faelligAm, forderungen, forderungsBereich, forderungsUebersicht, istForderungsZeitraum, projekteNachStatus, type OffeneRechnung } from "./dashboard";

const r = (teil: Partial<OffeneRechnung>): OffeneRechnung => ({
  status: "uebertragen", lexwareStatus: "open", rechnungsdatum: "2026-10-01", zahlungszielTage: 14, brutto: 100, ...teil,
});

describe("faelligAm", () => {
  it("Rechnungsdatum plus Zahlungsziel, ohne Ziel keine Fälligkeit", () => {
    expect(faelligAm("2026-10-01", 14)).toBe("2026-10-15");
    expect(faelligAm("2026-10-20", 0)).toBe("2026-10-20");
    expect(faelligAm("2026-10-01", null)).toBeNull();
  });
});

describe("forderungen", () => {
  it("zählt nur übertragene, bei Lexware offene Rechnungen", () => {
    const f = forderungen([r({}), r({ lexwareStatus: "paid" }), r({ status: "entwurf", lexwareStatus: "" }), r({ lexwareStatus: "voided" })], "2026-10-10");
    expect(f.offen).toEqual({ anzahl: 1, summe: 100 });
    expect(f.ueberfaellig.anzahl).toBe(0);
  });
  it("überfällig erst nach dem Fälligkeitstag, Fälligkeitstag selbst noch nicht", () => {
    const liste = [r({ brutto: 119.5 }), r({ rechnungsdatum: "2026-09-01", brutto: 1000.25 })];
    expect(forderungen(liste, "2026-10-15").ueberfaellig).toEqual({ anzahl: 1, summe: 1000.25 });
    expect(forderungen(liste, "2026-10-16").ueberfaellig).toEqual({ anzahl: 2, summe: 1119.75 });
    expect(forderungen(liste, "2026-10-16").offen.summe).toBe(1119.75);
  });
  it("ohne Zahlungsziel nie überfällig, fehlender Betrag zählt als 0", () => {
    const f = forderungen([r({ zahlungszielTage: null, brutto: null })], "2030-01-01");
    expect(f.offen).toEqual({ anzahl: 1, summe: 0 });
    expect(f.ueberfaellig.anzahl).toBe(0);
  });
  it("rechnet ohne Kommafehler (Cent)", () => {
    expect(forderungen([r({ brutto: 0.1 }), r({ brutto: 0.2 })], "2026-10-10").offen.summe).toBe(0.3);
  });
});

describe("Forderungsübersicht mit Zeitraum", () => {
  const heute = "2026-10-18";
  it("Zeiträume", () => {
    expect(forderungsBereich("90_tage", heute)).toEqual({ von: "2026-07-21", bis: "2026-10-18" });
    expect(forderungsBereich("monat", heute)).toEqual({ von: "2026-10-01", bis: "2026-10-31" });
    expect(forderungsBereich("letzter_monat", heute)).toEqual({ von: "2026-09-01", bis: "2026-09-30" });
    expect(forderungsBereich("jahr", heute)).toEqual({ von: "2026-01-01", bis: "2026-12-31" });
    expect(forderungsBereich("letztes_jahr", heute)).toEqual({ von: "2025-01-01", bis: "2025-12-31" });
    expect(forderungsBereich("letzter_monat", "2026-01-05")).toEqual({ von: "2025-12-01", bis: "2025-12-31" });
    expect(istForderungsZeitraum("monat")).toBe(true);
    expect(istForderungsZeitraum("quatsch")).toBe(false);
  });
  it("trennt Offen und Überfällig und zählt nur Rechnungen im Zeitraum", () => {
    const r = (rechnungsdatum: string, brutto: number): OffeneRechnung => ({ status: "uebertragen", lexwareStatus: "open", rechnungsdatum, zahlungszielTage: 14, brutto });
    const liste = [r("2026-10-10", 119), r("2026-10-01", 238), r("2026-09-01", 100), r("2025-12-01", 50)];
    const u = forderungsUebersicht(liste, heute, forderungsBereich("90_tage", heute));
    expect(u.gesamt).toEqual({ anzahl: 3, summe: 457 });
    expect(u.ueberfaellig).toEqual({ anzahl: 2, summe: 338 }); // 01.10. (fällig 15.10.) und 01.09.
    expect(u.offen).toEqual({ anzahl: 1, summe: 119 });
    expect(forderungsUebersicht(liste, heute, forderungsBereich("monat", heute)).gesamt.anzahl).toBe(2);
  });
});

describe("projekteNachStatus", () => {
  it("zählt je Status und sortiert nach der Einstellung", () => {
    const a = { name: "Angebot", farbe: "#111111", sortierung: 2 };
    const b = { name: "In Arbeit", farbe: "#222222", sortierung: 4 };
    const z = projekteNachStatus([
      { status_id: "b", project_statuses: b }, { status_id: "a", project_statuses: a }, { status_id: "b", project_statuses: b },
      { status_id: null, project_statuses: null },
    ]);
    expect(z.map((s) => [s.name, s.anzahl])).toEqual([["Angebot", 1], ["In Arbeit", 2]]);
  });
});

describe("chatSumme", () => {
  it("summiert Nachrichten und Projekte, Zahlen kommen als Text", () => {
    expect(chatSumme([{ anzahl: "3" }, { anzahl: 2 }, { anzahl: 0 }])).toEqual({ nachrichten: 5, projekte: 2 });
    expect(chatSumme(null)).toEqual({ nachrichten: 0, projekte: 0 });
  });
});
