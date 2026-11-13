import { describe, expect, it, vi } from "vitest";
import { ANGEBOT_KI_MODELL, angebotKiAnfrage, angebotKiAuswerten, angebotKiVorschlagenMit, type AngebotKiAntwort } from "./angebot-ki";

const katalog = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Wandflächen streichen", einheit: "m²", nummer: "01" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Decke streichen", einheit: "m²", nummer: "02" },
];
const antwort = (json: unknown, stop = "end_turn"): AngebotKiAntwort => ({ stop_reason: stop, content: [{ type: "text", text: JSON.stringify(json) }], usage: { input_tokens: 10, output_tokens: 5 } });

describe("KI-Assistent Angebot", () => {
  it("schickt Katalog mit Kennungen, aber keine Preise oder IDs", () => {
    const a = angebotKiAnfrage("Wohnzimmer streichen", katalog);
    expect(a.model).toBe(ANGEBOT_KI_MODELL);
    expect(a.messages[0].content).toContain("L1 | 01 | Wandflächen streichen | m²");
    expect(a.messages[0].content).not.toContain(katalog[0].id);
  });

  it("führt Kennungen auf Leistungen zurück, Name und Einheit aus den Stammdaten", () => {
    const e = angebotKiAuswerten(antwort({ hinweis: "", positionen: [
      { leistung: "L2", kurztext: "Decke", menge: 25.004, einheit: "qm", hinweis: "" },
      { leistung: "", kurztext: "Fugen ausbessern", menge: 0, einheit: "lfm", hinweis: "Menge prüfen" },
      { leistung: "L9", kurztext: "", menge: 3, einheit: "", hinweis: "" },
    ] }), katalog)!;
    expect(e.positionen).toEqual([
      { serviceId: katalog[1].id, kurztext: "Decke streichen", menge: 25, einheit: "m²", hinweis: "" },
      { serviceId: null, kurztext: "Fugen ausbessern", menge: 1, einheit: "lfm", hinweis: "Menge prüfen" },
    ]);
  });

  it("wiederholt einmal bei kaputter Antwort und meldet Ablehnung", async () => {
    const aufruf = vi.fn()
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "kein json" }], usage: { input_tokens: 1, output_tokens: 1 } })
      .mockResolvedValueOnce(antwort({ hinweis: "ok", positionen: [{ leistung: "L1", kurztext: "x", menge: 40, einheit: "m²", hinweis: "" }] }));
    const r = await angebotKiVorschlagenMit("Wände", katalog, aufruf, () => "Fehler");
    expect(aufruf).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ ok: true, positionen: [{ serviceId: katalog[0].id, menge: 40 }] });
    const abgelehnt = await angebotKiVorschlagenMit("x", katalog, async () => antwort({}, "refusal"), () => "Fehler");
    expect(abgelehnt.ok).toBe(false);
  });
});
