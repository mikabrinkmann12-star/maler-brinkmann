import { describe, expect, it } from "vitest";
import {
  eingangAnzeige,
  eingangDateiPruefen,
  eingangFaelligText,
  eingangFiltern,
  eingangsrechnungSchema,
  zuweisungStatus,
  zuweisungText,
  type EingangZeile,
} from "./eingangsrechnung";

function zeile(teil: Partial<EingangZeile> = {}): EingangZeile {
  return {
    id: "a",
    lieferant: "Farben Müller GmbH",
    rechnungsnummer: "RE-1",
    rechnungsdatum: "2026-03-12",
    faelligAm: "2026-03-26",
    netto: 100,
    brutto: 119,
    zahlstatus: "offen",
    projectId: null,
    projektText: "",
    bereich: null,
    zuPruefen: false,
    dateiname: "rechnung.pdf",
    quelle: "upload",
    hochgeladenAm: "2026-03-13T08:00:00Z",
    hochgeladenVon: "Lena Eigenmeier",
    ...teil,
  };
}

describe("Status", () => {
  it("offen, überfällig, bezahlt", () => {
    expect(eingangAnzeige(zeile(), "2026-03-20")).toBe("offen");
    expect(eingangAnzeige(zeile(), "2026-03-27")).toBe("ueberfaellig");
    expect(eingangAnzeige(zeile(), "2026-03-26")).toBe("offen");
    expect(eingangAnzeige(zeile({ zahlstatus: "bezahlt" }), "2026-12-01")).toBe("bezahlt");
    expect(eingangAnzeige(zeile({ faelligAm: null }), "2030-01-01")).toBe("offen");
  });

  it("Fälligkeitstext", () => {
    expect(eingangFaelligText(zeile(), "offen", "2026-03-18")).toBe("8 Tage");
    expect(eingangFaelligText(zeile(), "offen", "2026-03-26")).toBe("Heute");
    expect(eingangFaelligText(zeile(), "ueberfaellig", "2026-03-27")).toBe("-1 Tag");
    expect(eingangFaelligText(zeile(), "bezahlt", "2026-03-18")).toBe("");
  });

  it("Zuweisung", () => {
    expect(zuweisungStatus(zeile())).toBe("keine");
    expect(zuweisungStatus(zeile({ bereich: "lager" }))).toBe("vollstaendig");
    expect(zuweisungText(zeile({ bereich: "lager" }))).toBe("Lager");
    expect(zuweisungText(zeile({ projectId: "p", projektText: "P-1 – Haus" }))).toBe("P-1 – Haus");
    expect(zuweisungText(zeile())).toBe("–");
  });
});

describe("eingangFiltern", () => {
  const heute = "2026-03-27";
  const alle = [
    zeile({ id: "1" }),
    zeile({ id: "2", lieferant: "Gerüstbau Nord", rechnungsdatum: "2026-01-05", zahlstatus: "bezahlt", bereich: "lager", zuPruefen: true }),
    zeile({ id: "3", lieferant: "Lackhaus", rechnungsdatum: null, projectId: "p1", projektText: "P-1 – Haus" }),
  ].map((z) => ({ ...z, anzeige: eingangAnzeige(z, heute) }));
  const leer = { q: "", anzeige: [], zuweisung: [], projektIds: [], nurZuPruefen: false };

  it("ohne Filter alles", () => expect(eingangFiltern(alle, leer)).toHaveLength(3));
  it("Suche über Lieferant und Projekt", () => {
    expect(eingangFiltern(alle, { ...leer, q: "gerüstbau" }).map((z) => z.id)).toEqual(["2"]);
    expect(eingangFiltern(alle, { ...leer, q: "haus" }).map((z) => z.id)).toEqual(["3"]);
  });
  it("Zeitraum schließt Rechnungen ohne Datum aus", () => {
    expect(eingangFiltern(alle, { ...leer, von: "2026-03-01", bis: "2026-03-31" }).map((z) => z.id)).toEqual(["1"]);
  });
  it("Zahlstatus und Zuweisung", () => {
    expect(eingangFiltern(alle, { ...leer, anzeige: ["bezahlt"] }).map((z) => z.id)).toEqual(["2"]);
    expect(eingangFiltern(alle, { ...leer, anzeige: ["ueberfaellig"] }).map((z) => z.id)).toEqual(["1", "3"]);
    expect(eingangFiltern(alle, { ...leer, zuweisung: ["keine"] }).map((z) => z.id)).toEqual(["1"]);
    expect(eingangFiltern(alle, { ...leer, projektIds: ["p1"] }).map((z) => z.id)).toEqual(["3"]);
  });
  it("Reiter „Zu prüfen“", () => {
    expect(eingangFiltern(alle, { ...leer, nurZuPruefen: true }).map((z) => z.id)).toEqual(["2"]);
  });
});

describe("eingangsrechnungSchema", () => {
  const gut = {
    lieferant: " Farben Müller GmbH ",
    rechnungsnummer: "RE-1",
    rechnungsdatum: "2026-03-12",
    faelligAm: null,
    netto: "100,00",
    brutto: "1.190,00",
    iban: "de89 3704 0044 0532 0130 00",
    zahlstatus: "offen" as const,
    bezahltAm: null,
    projectId: null,
    bereich: "lager" as const,
    notiz: "",
  };
  it("nimmt deutsche Beträge und bereinigt Texte", () => {
    const r = eingangsrechnungSchema.parse(gut);
    expect(r.netto).toBe(100);
    expect(r.brutto).toBe(1190);
    expect(r.lieferant).toBe("Farben Müller GmbH");
    expect(r.iban).toBe("DE89370400440532013000");
  });
  it("leerer Betrag = nicht angegeben", () => {
    expect(eingangsrechnungSchema.parse({ ...gut, netto: "", brutto: "" }).brutto).toBeNull();
  });
  it("lehnt Projekt und Bereich zugleich ab", () => {
    const r = eingangsrechnungSchema.safeParse({ ...gut, projectId: "11111111-1111-4111-8111-111111111111" });
    expect(r.success).toBe(false);
  });
  it("lehnt Netto über Brutto und Unsinn ab", () => {
    expect(eingangsrechnungSchema.safeParse({ ...gut, netto: "2.000,00" }).success).toBe(false);
    expect(eingangsrechnungSchema.safeParse({ ...gut, brutto: "abc" }).success).toBe(false);
  });
});

describe("eingangDateiPruefen", () => {
  it("erlaubt PDF, XML und Bilder", () => {
    expect(eingangDateiPruefen("a.PDF", 10)).toEqual({ ok: true, endung: "pdf", typ: "application/pdf" });
    expect(eingangDateiPruefen("a.jpeg", 10)).toMatchObject({ ok: true, endung: "jpg" });
    expect(eingangDateiPruefen("a.xml", 10)).toMatchObject({ ok: true });
  });
  it("lehnt anderes, Leeres und Zu-Großes ab", () => {
    expect(eingangDateiPruefen("a.docx", 10).ok).toBe(false);
    expect(eingangDateiPruefen("a.pdf", 0).ok).toBe(false);
    expect(eingangDateiPruefen("a.pdf", 21 * 1024 * 1024).ok).toBe(false);
  });
});
