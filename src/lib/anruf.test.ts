import { describe, expect, it } from "vitest";
import { anrufNormalisieren, dauerText, geheimnisPasst, kategorieErkennen, nummerNormalisieren, nummernSchluessel } from "./anruf";

describe("nummerNormalisieren", () => {
  it("gleiche Nummer in verschiedenen Schreibweisen", () => {
    expect(nummerNormalisieren("04492 / 708108")).toBe("+494492708108");
    expect(nummerNormalisieren("+49 4492 708108")).toBe("+494492708108");
    expect(nummerNormalisieren("0049 4492 708108")).toBe("+494492708108");
    expect(nummernSchluessel("04492 708108")).toBe(nummernSchluessel("+49 (4492) 708-108"));
  });
  it("zu kurz oder leer ist keine Nummer", () => {
    expect(nummerNormalisieren("12")).toBeNull();
    expect(nummerNormalisieren("")).toBeNull();
    expect(nummerNormalisieren(null)).toBeNull();
  });
});

describe("kategorieErkennen", () => {
  it("Spam vor Anfrage, dann Anfrage, dann Information", () => {
    expect(kategorieErkennen("Telefonmarketing für ein kostenloses Angebot")).toBe("spam");
    expect(kategorieErkennen("Möchte ein Angebot für die Fassade und einen Termin zur Besichtigung")).toBe("anfrage");
    expect(kategorieErkennen("Bittet um Rückruf wegen der Lieferung")).toBe("information");
    expect(kategorieErkennen("Hat sich verwählt")).toBe("sonstiges");
    expect(kategorieErkennen("")).toBe("sonstiges");
  });
});

describe("anrufNormalisieren (generisch)", () => {
  it("übernimmt die Felder und erkennt die Kategorie selbst", () => {
    const r = anrufNormalisieren({ id: "a1", von: "04492 123456", zusammenfassung: "Frau Meyer möchte ein Angebot für das Wohnzimmer.", dauer_sek: 125, beginn: "2026-10-22T08:30:00Z" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.anruf).toMatchObject({ anbieter: "generisch", anbieterId: "a1", richtung: "eingehend", vonNummer: "04492 123456", dauerSek: 125, kategorie: "anfrage", beginn: "2026-10-22T08:30:00.000Z" });
  });
  it("Kategorie des Dienstes gilt, wenn sie bekannt ist", () => {
    const r = anrufNormalisieren({ id: "a2", zusammenfassung: "Angebot", kategorie: "spam" });
    expect(r.ok && r.anruf.kategorie).toBe("spam");
  });
  it("ohne ID oder ohne Inhalt wird abgelehnt", () => {
    expect(anrufNormalisieren({ zusammenfassung: "x" })).toMatchObject({ ok: false });
    expect(anrufNormalisieren({ id: "a3" })).toMatchObject({ ok: false });
    expect(anrufNormalisieren("nur Text")).toMatchObject({ ok: false });
    expect(anrufNormalisieren([1])).toMatchObject({ ok: false });
  });
  it("unsinnige Dauer wird ignoriert, Texte werden gekürzt", () => {
    const r = anrufNormalisieren({ id: "a4", zusammenfassung: "x".repeat(5000), dauer_sek: -5 });
    expect(r.ok && r.anruf.dauerSek).toBeNull();
    expect(r.ok && r.anruf.zusammenfassung.length).toBe(4000);
  });
});

describe("anrufNormalisieren (Retell)", () => {
  const ereignis = {
    event: "call_analyzed",
    call: {
      call_id: "call_123",
      direction: "inbound",
      from_number: "+4944921234",
      to_number: "+4944927081",
      start_timestamp: 1_792_000_000_000,
      end_timestamp: 1_792_000_185_000,
      transcript_object: [{ role: "agent", content: "Maler Brinkmann, guten Tag." }, { role: "user", content: "Ich brauche ein Angebot." }],
      call_analysis: { call_summary: "Anrufer möchte ein Angebot für einen Außenanstrich." },
    },
  };
  it("liest Nummern, Dauer, Zusammenfassung und Transkript", () => {
    const r = anrufNormalisieren(ereignis);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.anruf).toMatchObject({ anbieter: "retell", anbieterId: "call_123", richtung: "eingehend", vonNummer: "+4944921234", dauerSek: 185, kategorie: "anfrage" });
    expect(r.anruf.transkript).toBe("KI: Maler Brinkmann, guten Tag.\nAnrufer: Ich brauche ein Angebot.");
  });
  it("andere Ereignisse werden nicht gebraucht", () => {
    expect(anrufNormalisieren({ event: "call_started", call: { call_id: "x" } })).toMatchObject({ ok: false });
  });
});

describe("geheimnisPasst / dauerText", () => {
  it("vergleicht genau", () => {
    expect(geheimnisPasst("abc", "abc")).toBe(true);
    expect(geheimnisPasst("abd", "abc")).toBe(false);
    expect(geheimnisPasst("abcd", "abc")).toBe(false);
    expect(geheimnisPasst(null, "abc")).toBe(false);
    expect(geheimnisPasst("abc", undefined)).toBe(false);
    expect(geheimnisPasst("", "")).toBe(false);
  });
  it("Dauer als Text", () => {
    expect(dauerText(45)).toBe("45 Sek");
    expect(dauerText(205)).toBe("3:25 Min");
    expect(dauerText(null)).toBe("–");
  });
});
