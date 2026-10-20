import { describe, expect, it } from "vitest";
import { anzeigeStatus, faelligBeschreibung, faelligText, offenerBetrag, rechnungenFiltern } from "./rechnung-liste";

const heute = "2026-10-18";
const r = (teil: Partial<Parameters<typeof anzeigeStatus>[0]> = {}) => ({
  status: "uebertragen" as const, lexwareStatus: "open", rechnungsdatum: "2026-10-10", zahlungszielTage: 14, ...teil,
});

describe("anzeigeStatus", () => {
  it("Entwurf und laufende Übertragung", () => {
    expect(anzeigeStatus(r({ status: "entwurf", lexwareStatus: "" }), heute)).toBe("entwurf");
    expect(anzeigeStatus(r({ status: "wird_uebertragen" }), heute)).toBe("uebertragung");
  });
  it("offen, überfällig, bezahlt, storniert nach dem Stand von Lexware", () => {
    expect(anzeigeStatus(r(), heute)).toBe("offen"); // fällig am 24.10.
    expect(anzeigeStatus(r({ rechnungsdatum: "2026-10-01" }), heute)).toBe("ueberfaellig"); // fällig am 15.10.
    expect(anzeigeStatus(r({ rechnungsdatum: "2026-10-04" }), heute)).toBe("offen"); // fällig genau heute: noch nicht überfällig
    expect(anzeigeStatus(r({ zahlungszielTage: null, rechnungsdatum: "2020-01-01" }), heute)).toBe("offen"); // ohne Ziel nie überfällig
    expect(anzeigeStatus(r({ mahnstufe: 1 }), heute)).toBe("angemahnt");
    expect(anzeigeStatus(r({ mahnstufe: 2, lexwareStatus: "paid" }), heute)).toBe("bezahlt"); // bezahlt geht vor
    expect(anzeigeStatus(r({ lexwareStatus: "paid" }), heute)).toBe("bezahlt");
    expect(anzeigeStatus(r({ lexwareStatus: "paidoff" }), heute)).toBe("bezahlt");
    expect(anzeigeStatus(r({ lexwareStatus: "voided" }), heute)).toBe("storniert");
  });
});

describe("rechnungenFiltern", () => {
  const z = (id: string, anzeige: "offen" | "bezahlt" | "entwurf", rechnungsdatum: string, projektId = "p1") => ({ id, anzeige, rechnungsdatum, projektId });
  const liste = [z("a", "offen", "2026-10-10"), z("b", "bezahlt", "2026-09-01", "p2"), z("c", "entwurf", "2026-10-15")];
  const ids = (f: Parameters<typeof rechnungenFiltern>[1]) => rechnungenFiltern(liste, f).map((x) => x.id);
  it("Status, Zeitraum und Projekt", () => {
    expect(ids({ status: [], projektIds: [] })).toEqual(["a", "b", "c"]);
    expect(ids({ status: ["offen", "bezahlt"], projektIds: [] })).toEqual(["a", "b"]);
    expect(ids({ status: [], projektIds: [], von: "2026-10-01", bis: "2026-10-12" })).toEqual(["a"]);
    expect(ids({ status: [], projektIds: ["p2"] })).toEqual(["b"]);
  });
});

describe("faelligText und offenerBetrag", () => {
  it("Tage bis zur Fälligkeit, negativ wenn überfällig", () => {
    expect(faelligText(r(), "offen", heute)).toBe("6 Tage");
    expect(faelligText(r({ rechnungsdatum: "2026-10-04" }), "offen", heute)).toBe("Heute");
    expect(faelligText(r({ rechnungsdatum: "2026-10-03" }), "ueberfaellig", heute)).toBe("-1 Tag");
    expect(faelligText(r({ rechnungsdatum: "2026-10-01" }), "ueberfaellig", heute)).toBe("-3 Tage");
    expect(faelligText(r(), "bezahlt", heute)).toBe("");
    expect(faelligText(r({ zahlungszielTage: null }), "offen", heute)).toBe("");
  });
  it("offen ist nur, was noch nicht bezahlt ist", () => {
    expect(offenerBetrag({ brutto: 119 }, "offen")).toBe(119);
    expect(offenerBetrag({ brutto: 119 }, "ueberfaellig")).toBe(119);
    expect(offenerBetrag({ brutto: 119 }, "angemahnt")).toBe(119);
    expect(offenerBetrag({ brutto: 119 }, "bezahlt")).toBe(0);
    expect(offenerBetrag({ brutto: 119 }, "entwurf")).toBe(0);
  });
});

describe("faelligBeschreibung", () => {
  it("beschreibt die Fälligkeit in Worten", () => {
    expect(faelligBeschreibung("2026-10-27", "2026-10-20")).toBe("In 7 Tagen");
    expect(faelligBeschreibung("2026-10-21", "2026-10-20")).toBe("In 1 Tag");
    expect(faelligBeschreibung("2026-10-20", "2026-10-20")).toBe("Heute");
    expect(faelligBeschreibung("2026-10-19", "2026-10-20")).toBe("1 Tag überfällig");
    expect(faelligBeschreibung("2026-10-10", "2026-10-20")).toBe("10 Tage überfällig");
    expect(faelligBeschreibung(null, "2026-10-20")).toBe("–");
  });
});
