import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RAUM_ARTEN } from "@/lib/flaechen-typen";
import {
  FEHLER_ABGELEHNT,
  FEHLER_OHNE_SCHLUESSEL,
  FEHLER_ZU_GROSS,
  FEHLER_ZWEIMAL_UNGUELTIG,
  GRUNDRISS_MAX_BYTES,
  GRUNDRISS_SCHEMA,
  grundrissAnweisung,
  grundrissLesenMit,
  raeumeAusAntwort,
  type GrundrissAnfrage,
  type GrundrissAntwort,
} from "@/lib/grundriss-ki";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // „%PDF“

function raum(teil: Partial<Record<string, unknown>> = {}) {
  return { geschoss: "Erdgeschoss", wohnung: "", raumname: "Wohnen", art: "wohnraum", flaeche_m2: 24.5, seite: 1, ...teil };
}

function antwort(text: string, ein = 100, aus = 20, stop: string | null = "end_turn"): GrundrissAntwort {
  return { stop_reason: stop, content: [{ type: "text", text }], usage: { input_tokens: ein, output_tokens: aus } };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("GRUNDRISS_SCHEMA", () => {
  it("verlangt alle Felder und verbietet zusätzliche", () => {
    expect(GRUNDRISS_SCHEMA.required).toEqual(["raeume"]);
    expect(GRUNDRISS_SCHEMA.additionalProperties).toBe(false);
    const item = GRUNDRISS_SCHEMA.properties.raeume.items;
    expect(item.additionalProperties).toBe(false);
    expect([...item.required].sort()).toEqual(["art", "flaeche_m2", "geschoss", "raumname", "seite", "wohnung"]);
    expect(Object.keys(item.properties).sort()).toEqual([...item.required].sort());
  });

  it("art-Enum entspricht RAUM_ARTEN, Fläche darf null sein, Seite ist ganzzahlig", () => {
    const p = GRUNDRISS_SCHEMA.properties.raeume.items.properties;
    expect(p.art.enum).toEqual([...RAUM_ARTEN]);
    expect(p.flaeche_m2.anyOf).toEqual([{ type: "number" }, { type: "null" }]);
    expect(p.seite.type).toBe("integer");
  });
});

describe("grundrissAnweisung", () => {
  it("enthält die Kernregeln", () => {
    const a = grundrissAnweisung();
    expect(a).toContain("DIN-F");
    expect(a).toContain("Brutto-F wird ignoriert");
    expect(a).toContain("\"aussen\"");
    expect(a).toContain("flaeche_m2 = null");
    // Nebenräume außerhalb der Wohnungen und enge Regel für „wohnraum“
    expect(a).toContain("Fahrräder, Geräte, Abstellraum, Müll, Garage, Carport, Werkstatt");
    expect(a).toContain("Im Zweifel NICHT \"wohnraum\"");
  });
});

describe("raeumeAusAntwort", () => {
  it("macht aus einer gültigen Antwort Räume", () => {
    const r = raeumeAusAntwort({ raeume: [raum({ wohnung: " Wohnung 1 ", raumname: "  Bad ", art: "bad", seite: 2 })] });
    expect(r).toEqual([
      { geschoss: "Erdgeschoss", wohnung: "Wohnung 1", name: "Bad", boden: 24.5, art: "bad", seite: 2, quelle: "ki" },
    ]);
  });

  it("lässt eine nicht lesbare Fläche leer", () => {
    expect(raeumeAusAntwort({ raeume: [raum({ flaeche_m2: null })] })?.[0].boden).toBeNull();
  });

  it("rundet auf 2 Stellen und verwirft unplausible Flächen", () => {
    const r = raeumeAusAntwort({
      raeume: [raum({ flaeche_m2: 12.3456 }), raum({ flaeche_m2: 0 }), raum({ flaeche_m2: -3 }), raum({ flaeche_m2: 2500 })],
    });
    expect(r?.map((x) => x.boden)).toEqual([12.35, null, null, null]);
  });

  it("ungültige Antworten ergeben null", () => {
    expect(raeumeAusAntwort(null)).toBeNull();
    expect(raeumeAusAntwort({})).toBeNull();
    expect(raeumeAusAntwort({ raeume: [raum({ art: "keller" })] })).toBeNull();
    expect(raeumeAusAntwort({ raeume: [raum({ flaeche_m2: "12" })] })).toBeNull();
  });

  it("dedupliziert gleiche Räume nicht", () => {
    const r = raeumeAusAntwort({ raeume: [raum({ raumname: "Bad", art: "bad" }), raum({ raumname: "Bad", art: "bad" })] });
    expect(r).toHaveLength(2);
  });

  it("lässt leere Raumnamen weg, begrenzt Längen und korrigiert die Seite", () => {
    const r = raeumeAusAntwort({
      raeume: [raum({ raumname: "   " }), raum({ raumname: "x".repeat(200), geschoss: "g".repeat(80), seite: 0 })],
    });
    expect(r).toHaveLength(1);
    expect(r?.[0].name).toHaveLength(120);
    expect(r?.[0].geschoss).toHaveLength(40);
    expect(r?.[0].seite).toBe(1);
  });
});

describe("grundrissLesenMit", () => {
  const gueltig = JSON.stringify({ raeume: [raum()] });

  it("sendet ohne Schlüssel nichts", async () => {
    const aufruf = vi.fn();
    expect(await grundrissLesenMit(PDF, undefined, aufruf)).toEqual({ raeume: [], fehler: FEHLER_OHNE_SCHLUESSEL });
    expect(await grundrissLesenMit(PDF, "  ", aufruf)).toEqual({ raeume: [], fehler: FEHLER_OHNE_SCHLUESSEL });
    expect(aufruf).not.toHaveBeenCalled();
  });

  it("lehnt zu große Dateien ohne Aufruf ab", async () => {
    const aufruf = vi.fn();
    const r = await grundrissLesenMit(new Uint8Array(GRUNDRISS_MAX_BYTES + 1), "sk-test", aufruf);
    expect(r.fehler).toBe(FEHLER_ZU_GROSS);
    expect(aufruf).not.toHaveBeenCalled();
  });

  it("schickt Modell claude-sonnet-5-5 mit effort low und das PDF vor dem Text", async () => {
    const aufruf = vi.fn<(a: GrundrissAnfrage) => Promise<GrundrissAntwort>>().mockResolvedValue(antwort(gueltig));
    await grundrissLesenMit(PDF, "sk-test", aufruf);
    const anfrage = aufruf.mock.calls[0][0];
    expect(anfrage.model).toBe("claude-sonnet-5-5");
    expect(anfrage.output_config.effort).toBe("low");
    expect(anfrage.output_config.format.type).toBe("json_schema");
    expect(anfrage.output_config.format.schema).toBe(GRUNDRISS_SCHEMA);
    expect(anfrage.messages[0].content[0].type).toBe("document");
    expect(anfrage.messages[0].content[0].source.data).toBe(Buffer.from(PDF).toString("base64"));
    expect(anfrage.messages[0].content[1]).toEqual({ type: "text", text: "Lies alle Räume aus diesem Grundriss." });
    expect(anfrage).not.toHaveProperty("thinking");
    expect(anfrage).not.toHaveProperty("temperature");
  });

  it("wiederholt einmal bei kaputtem JSON und summiert die Token", async () => {
    const aufruf = vi
      .fn<(a: GrundrissAnfrage) => Promise<GrundrissAntwort>>()
      .mockResolvedValueOnce(antwort("{ kaputt", 1000, 50))
      .mockResolvedValueOnce(antwort(gueltig, 1000, 80));
    const r = await grundrissLesenMit(PDF, "sk-test", aufruf);
    expect(aufruf).toHaveBeenCalledTimes(2);
    expect(r.fehler).toBeUndefined();
    expect(r.raeume).toHaveLength(1);
    expect(r.tokens).toEqual({ eingabe: 2000, ausgabe: 130 });
    expect(console.info).toHaveBeenCalledTimes(2);
  });

  it("gibt nach zwei ungültigen Antworten den Fehlertext zurück", async () => {
    const aufruf = vi
      .fn<(a: GrundrissAnfrage) => Promise<GrundrissAntwort>>()
      .mockResolvedValueOnce(antwort("kein json"))
      .mockResolvedValueOnce(antwort(JSON.stringify({ raeume: [raum({ art: "falsch" })] })));
    const r = await grundrissLesenMit(PDF, "sk-test", aufruf);
    expect(aufruf).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ raeume: [], fehler: FEHLER_ZWEIMAL_UNGUELTIG, tokens: { eingabe: 200, ausgabe: 40 } });
  });

  it("meldet eine Ablehnung ohne Wiederholung", async () => {
    const aufruf = vi.fn(async () => antwort("", 10, 1, "refusal"));
    const r = await grundrissLesenMit(PDF, "sk-test", aufruf);
    expect(aufruf).toHaveBeenCalledTimes(1);
    expect(r.fehler).toBe(FEHLER_ABGELEHNT);
  });

  it("stürzt bei Netzwerkfehlern nicht ab", async () => {
    const aufruf = vi.fn(async () => {
      throw new Error("offline");
    });
    const r = await grundrissLesenMit(PDF, "sk-test", aufruf);
    expect(r.raeume).toEqual([]);
    expect(r.fehler).toBeTruthy();
  });
});
