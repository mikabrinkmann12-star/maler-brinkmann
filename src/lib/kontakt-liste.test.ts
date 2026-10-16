import { describe, expect, it } from "vitest";
import { fehltAngabe, kontakteSortieren, orteMitAnzahl, sortierName, type ListenKontakt } from "./kontakt-liste";

const k = (teil: Partial<ListenKontakt> & { id: string }): ListenKontakt => ({
  kundennummer: null, typ: "privat", firmenname: null, vorname: null, nachname: null, strasse: null, plz: null, ort: null,
  telefon: null, mobil: null, email: null, created_at: "2026-01-01T10:00:00Z", updated_at: "2026-01-01T10:00:00Z", ...teil,
});

const liste = [
  k({ id: "mueller", nachname: "Müller", vorname: "Anna", updated_at: "2026-03-01T10:00:00Z", created_at: "2026-02-01T10:00:00Z" }),
  k({ id: "zeller", nachname: "Zeller", vorname: "Karl", updated_at: "2026-05-01T10:00:00Z", created_at: "2026-01-15T10:00:00Z" }),
  k({ id: "bau", typ: "firma", firmenname: "Ahrens Bau GmbH", updated_at: "2026-01-10T10:00:00Z", created_at: "2026-03-20T10:00:00Z" }),
  k({ id: "ahlers", nachname: "Ählers", vorname: "Eva", updated_at: "2026-03-01T10:00:00Z", created_at: "2026-01-02T10:00:00Z" }),
];

describe("kontakteSortieren", () => {
  it("Name A→Z und Z→A (Firma nach Firmenname, Person nach Nachname, Umlaute einsortiert)", () => {
    expect(kontakteSortieren(liste, "name_auf").map((x) => x.id)).toEqual(["ahlers", "bau", "mueller", "zeller"]);
    expect(kontakteSortieren(liste, "name_ab").map((x) => x.id)).toEqual(["zeller", "mueller", "bau", "ahlers"]);
  });

  it("zuletzt bearbeitet: neueste zuerst bzw. älteste zuerst, bei gleichem Datum nach Name", () => {
    expect(kontakteSortieren(liste, "geaendert_neu").map((x) => x.id)).toEqual(["zeller", "ahlers", "mueller", "bau"]);
    expect(kontakteSortieren(liste, "geaendert_alt").map((x) => x.id)).toEqual(["bau", "ahlers", "mueller", "zeller"]);
  });

  it("angelegt: neueste zuerst bzw. älteste zuerst", () => {
    expect(kontakteSortieren(liste, "angelegt_neu").map((x) => x.id)).toEqual(["bau", "mueller", "zeller", "ahlers"]);
    expect(kontakteSortieren(liste, "angelegt_alt").map((x) => x.id)).toEqual(["ahlers", "zeller", "mueller", "bau"]);
  });

  it("ändert die Eingabe nicht", () => {
    const kopie = [...liste];
    kontakteSortieren(liste, "name_ab");
    expect(liste).toEqual(kopie);
  });
});

describe("fehltAngabe und orteMitAnzahl", () => {
  it("erkennt fehlende Telefonnummer (Handy zählt), E-Mail, Adresse und Kundennummer", () => {
    expect(fehltAngabe(k({ id: "a" }), "telefon")).toBe(true);
    expect(fehltAngabe(k({ id: "a", mobil: "0170" }), "telefon")).toBe(false);
    expect(fehltAngabe(k({ id: "a", email: "  " }), "email")).toBe(true);
    expect(fehltAngabe(k({ id: "a", strasse: "Weg 1", plz: "26683" }), "adresse")).toBe(true);
    expect(fehltAngabe(k({ id: "a", strasse: "Weg 1", plz: "26683", ort: "Saterland" }), "adresse")).toBe(false);
    expect(fehltAngabe(k({ id: "a", kundennummer: "KD-1" }), "kundennummer")).toBe(false);
  });

  it("zählt Orte und sortiert sie alphabetisch", () => {
    expect(orteMitAnzahl([k({ id: "1", ort: "Saterland" }), k({ id: "2", ort: "Friesoythe" }), k({ id: "3", ort: "Saterland" }), k({ id: "4" })]))
      .toEqual([{ ort: "Friesoythe", anzahl: 1 }, { ort: "Saterland", anzahl: 2 }]);
    expect(sortierName({ firmenname: null, vorname: "Anna", nachname: "Müller" })).toBe("Müller Anna");
  });
});
