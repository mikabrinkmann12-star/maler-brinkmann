import { describe, expect, it } from "vitest";
import { abfragenZaehlen, aktionLesen, istSchreibend } from "./ki-system";

describe("aktionLesen", () => {
  it("macht aus Schreibaufrufen lesbare Sätze", () => {
    expect(aktionLesen("POST", "container", 201)).toEqual({ text: "Container gemeldet", schreibend: true, ok: true });
    expect(aktionLesen("POST", "/container/2ae0c891-e558-438b-b93c-aebbae1da713/erledigt", 200).text).toBe("Container-Meldung als erledigt markiert");
    expect(aktionLesen("POST", "angebote/abc/positionen", 201).text).toBe("Positionen zu einem Angebot hinzugefügt");
    expect(aktionLesen("POST", "rechnungen", 201).text).toBe("Rechnungsentwurf angelegt");
  });

  it("markiert Fehler und kennt unbekannte Änderungen", () => {
    expect(aktionLesen("POST", "zeiten", 409).ok).toBe(false);
    expect(aktionLesen("PATCH", "irgendwas/neu", 200).text).toContain("irgendwas/neu");
  });

  it("macht aus Abfragen den Bereich", () => {
    expect(aktionLesen("GET", "/api/v1/projekte/abc", 200)).toEqual({ text: "Abgefragt: Projekte", schreibend: false, ok: true });
    expect(aktionLesen("GET", "", 200).text).toBe("Abgefragt: Katalog der Schnittstelle");
    expect(istSchreibend("get")).toBe(false);
    expect(istSchreibend("post")).toBe(true);
  });
});

describe("abfragenZaehlen", () => {
  it("zählt nur Abfragen, häufigste zuerst", () => {
    const z = abfragenZaehlen([
      { methode: "GET", pfad: "projekte", status: 200 },
      { methode: "GET", pfad: "projekte/x", status: 200 },
      { methode: "GET", pfad: "zeiten", status: 200 },
      { methode: "POST", pfad: "zeiten", status: 201 },
    ]);
    expect(z).toEqual([{ text: "Abgefragt: Projekte", anzahl: 2 }, { text: "Abgefragt: Zeiten", anzahl: 1 }]);
  });
});
