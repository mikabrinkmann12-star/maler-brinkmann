import { describe, expect, it } from "vitest";
import { listeLesen, mitAuftrag, mitFehler, neueId, ohneAuftrag, type Auftrag } from "./warteschlange";

const a: Auftrag = { schluessel: "a", typ: "zeit_anlegen", titel: "A", nutzlast: { x: 1 }, erstelltAm: "2026-10-16T10:00:00Z" };
const b: Auftrag = { ...a, schluessel: "b", titel: "B" };

describe("Warteschlange", () => {
  it("gleicher Schlüssel ersetzt die ältere Fassung", () => {
    const neu = { ...a, titel: "A2" };
    expect(mitAuftrag([a, b], neu)).toEqual([b, neu]);
  });

  it("entfernt Aufträge und merkt sich Fehler", () => {
    expect(ohneAuftrag([a, b], "a")).toEqual([b]);
    expect(mitFehler([a, b], "b", "Sperrfrist")[1]).toEqual({ ...b, fehler: "Sperrfrist" });
  });

  it("liest den Gerätespeicher tolerant (kaputte Daten → leer)", () => {
    expect(listeLesen(JSON.stringify([a, { kaputt: true }]))).toEqual([a]);
    expect(listeLesen("{nicht json")).toEqual([]);
    expect(listeLesen(null)).toEqual([]);
    expect(listeLesen('{"schluessel":"a"}')).toEqual([]);
  });
});

describe("neueId", () => {
  it("erzeugt gültige, verschiedene UUIDs", () => {
    const a = neueId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(neueId()).not.toBe(a);
  });
});
