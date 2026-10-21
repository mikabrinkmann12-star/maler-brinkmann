import { describe, expect, it } from "vitest";
import { DOKUMENTARTEN, DOKUMENTART_INFO, dokumentTitel, dokumentartInfo, istDokumentart, rechnungMoeglich } from "./dokumentart";

describe("Dokumentarten", () => {
  it("kennt sechs Arten, alle mit Namen", () => {
    expect(DOKUMENTARTEN).toHaveLength(6);
    for (const a of DOKUMENTARTEN) expect(DOKUMENTART_INFO[a].name.length).toBeGreaterThan(2);
  });

  it("erkennt gültige und ungültige Arten, unbekannt gilt als Angebot", () => {
    expect(istDokumentart("lieferschein")).toBe(true);
    expect(istDokumentart("rechnung")).toBe(false);
    expect(dokumentartInfo("quatsch").name).toBe("Angebot");
    expect(dokumentartInfo(undefined).name).toBe("Angebot");
  });

  it("bildet den Titel mit Nachtrag und Entwurf", () => {
    expect(dokumentTitel("angebot", false, false)).toBe("Angebot");
    expect(dokumentTitel("auftragsbestaetigung", true, true)).toBe("Nachtrag - Auftragsbestätigung - Entwurf");
  });

  it("Lieferschein ohne Preise, Brief ohne Positionen, Annahme nur bei Angebot und Kostenvoranschlag", () => {
    expect(DOKUMENTART_INFO.lieferschein.preise).toBe(false);
    expect(DOKUMENTART_INFO.brief.positionen).toBe(false);
    expect(DOKUMENTARTEN.filter((a) => DOKUMENTART_INFO[a].zustimmung)).toEqual(["angebot", "kostenvoranschlag"]);
  });

  it("Rechnungen entstehen nur aus Angebot, Kostenvoranschlag und Auftragsbestätigung", () => {
    expect(DOKUMENTARTEN.filter(rechnungMoeglich)).toEqual(["angebot", "kostenvoranschlag", "auftragsbestaetigung"]);
  });
});
