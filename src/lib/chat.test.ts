import { describe, expect, it } from "vitest";
import { erwaehnt, erwaehnungEinsetzen, erwaehnungsVorschlaege, nachTagen, nachrichtSchema, tagesUeberschrift, ungelesenKarte, zaehlerText } from "./chat";

const P = "0b8f6e5c-2f0c-4a2e-9d57-2a1b3c4d5e6f";
const N = "1b8f6e5c-2f0c-4a2e-9d57-2a1b3c4d5e6f";
const F = "2b8f6e5c-2f0c-4a2e-9d57-2a1b3c4d5e6f";

describe("nachrichtSchema", () => {
  it("nimmt Text, schneidet Leerzeichen ab", () => {
    const r = nachrichtSchema.safeParse({ id: N, projektId: P, text: "  Farbe ist da \n" });
    expect(r.success && r.data.text).toBe("Farbe ist da");
  });
  it("lehnt leere Nachrichten ab, erlaubt aber einen Anhang ohne Text", () => {
    expect(nachrichtSchema.safeParse({ id: N, projektId: P, text: "   " }).success).toBe(false);
    expect(nachrichtSchema.safeParse({ id: N, projektId: P, fotoId: F }).success).toBe(true);
    expect(nachrichtSchema.safeParse({ id: N, projektId: P, dateiId: F, text: "Plan" }).success).toBe(true);
  });
  it("lehnt zwei Anhänge, zu lange Texte und falsche IDs ab", () => {
    expect(nachrichtSchema.safeParse({ id: N, projektId: P, fotoId: F, dateiId: F }).success).toBe(false);
    expect(nachrichtSchema.safeParse({ id: N, projektId: P, text: "x".repeat(2001) }).success).toBe(false);
    expect(nachrichtSchema.safeParse({ id: "abc", projektId: P, text: "Hallo" }).success).toBe(false);
  });
});

describe("zaehlerText", () => {
  it("zeigt nichts bei 0, die Zahl bis 99 und danach 99+", () => {
    expect(zaehlerText(0)).toBe("");
    expect(zaehlerText(3)).toBe("3");
    expect(zaehlerText(99)).toBe("99");
    expect(zaehlerText(100)).toBe("99+");
  });
});

describe("Tage", () => {
  const jetzt = new Date("2026-10-18T10:00:00+02:00");
  const lang = (iso: string) => `Datum ${iso}`;
  it("Heute, Gestern, sonst das Datum", () => {
    expect(tagesUeberschrift("2026-10-18", jetzt, lang)).toBe("Heute");
    expect(tagesUeberschrift("2026-10-17", jetzt, lang)).toBe("Gestern");
    expect(tagesUeberschrift("2026-10-10", jetzt, lang)).toBe("Datum 2026-10-10");
  });
  it("gruppiert nach Berliner Tag (Mitternacht zählt nach Berliner Zeit)", () => {
    const g = nachTagen([
      { created_at: "2026-10-17T21:59:00Z" }, // 23:59 Berlin am 17.
      { created_at: "2026-10-17T22:01:00Z" }, // 00:01 Berlin am 18.
      { created_at: "2026-10-18T08:00:00Z" },
    ]);
    expect(g.map((x) => [x.tag, x.nachrichten.length])).toEqual([["2026-10-17", 1], ["2026-10-18", 2]]);
  });
});

describe("Erwähnungen", () => {
  it("erkennt @Vorname und @Vorname Nachname, Groß-/Kleinschreibung egal", () => {
    expect(erwaehnt("Hallo @Anna, kannst du kommen?", "Anna", "Zander")).toBe(true);
    expect(erwaehnt("@anna zander bitte melden", "Anna", "Zander")).toBe(true);
    expect(erwaehnt("Danke @Anna Zander!", "Anna", "Zander")).toBe(true);
  });
  it("braucht das @ und ein Wortende", () => {
    expect(erwaehnt("Anna ist da", "Anna", "Zander")).toBe(false);
    expect(erwaehnt("@Annabelle kommt", "Anna", "Zander")).toBe(false);
  });
  it("zählt E-Mail-Adressen nicht", () => {
    expect(erwaehnt("Schreib an max@anna.de", "Anna", "Zander")).toBe(false);
    expect(erwaehnt("kontakt:anna@firma.de", "Anna", "Zander")).toBe(false);
  });
  it("kommt mit Umlauten und Sonderzeichen im Namen klar", () => {
    expect(erwaehnt("@Jörg bitte anrufen", "Jörg", "Müller")).toBe(true);
    expect(erwaehnt("@Jan (Chef)", "Jan", "Brien")).toBe(true);
    expect(erwaehnt("@Jan.O bitte", "Jan.O", "Brien")).toBe(true);
  });
  it("leerer Name oder Text ohne @ ergibt nein", () => {
    expect(erwaehnt("@ hallo", "", "")).toBe(false);
    expect(erwaehnt("hallo", "Anna", "Zander")).toBe(false);
  });
  const personen = [{ id: "1", name: "Anna Zander" }, { id: "2", name: "Bert Adler" }, { id: "3", name: "Annika Berg" }];
  it("schlägt beim Tippen passende Namen vor", () => {
    expect(erwaehnungsVorschlaege("Hallo @An", personen).map((p) => p.id)).toEqual(["1", "3"]);
    expect(erwaehnungsVorschlaege("@ad", personen).map((p) => p.id)).toEqual(["2"]);
    expect(erwaehnungsVorschlaege("@", personen)).toHaveLength(3);
  });
  it("schlägt nichts vor, wenn das @ nicht am Ende angefangen wird", () => {
    expect(erwaehnungsVorschlaege("Hallo Anna", personen)).toEqual([]);
    expect(erwaehnungsVorschlaege("max@an", personen)).toEqual([]);
    expect(erwaehnungsVorschlaege("@Anna Zander ist da", personen)).toEqual([]);
  });
  it("setzt den gewählten Namen ein", () => {
    expect(erwaehnungEinsetzen("Hallo @An", "Anna Zander")).toBe("Hallo @Anna Zander ");
    expect(erwaehnungEinsetzen("@", "Bert Adler")).toBe("@Bert Adler ");
    expect(erwaehnungEinsetzen("kein at", "Bert Adler")).toBe("kein at");
  });
});

describe("ungelesenKarte", () => {
  it("macht aus den Zeilen eine Nachschlagetabelle (Zahlen kommen als Text)", () => {
    const k = ungelesenKarte([{ project_id: P, anzahl: "4" }]);
    expect(k.get(P)).toBe(4);
    expect(ungelesenKarte(null).size).toBe(0);
  });
});
