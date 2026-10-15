import { describe, expect, it } from "vitest";
import { abstand, einteilungErkennen, normalisieren } from "./einteilung-erkennung";

const daten = {
  mitarbeiter: [
    { id: "seb", vorname: "Sebastian", nachname: "Meyer" },
    { id: "chr", vorname: "Christian", nachname: "Lüken" },
    { id: "jan", vorname: "Jan", nachname: "Wilken" },
    { id: "tob", vorname: "Tobias", nachname: "Hinrichs" },
    { id: "mar", vorname: "Marco", nachname: "Ahlers" },
    { id: "jan2", vorname: "Jan", nachname: "Bruns" },
  ],
  fahrzeuge: [
    { id: "s1", name: "Sprinter 1", kennzeichen: "CLP-DE 101" },
    { id: "s2", name: "Sprinter 2", kennzeichen: "CLP-DE 102" },
    { id: "caddy", name: "Caddy", kennzeichen: "CLP-DE 301" },
  ],
  projekte: [
    { id: "gerdes", name: "Innenanstrich Wohnung Gerdes", stichworte: ["Gerdes", "Saterland-Scharrel", "Birkenweg 7"] },
    { id: "ring", name: "Fassade Ringstraße 14", stichworte: ["Hausverwaltung Nordwest GmbH", "Friesoythe", "Ringstraße 14"] },
    { id: "kramer", name: "Fenster lackieren Kramer", stichworte: ["Kramer", "Saterland-Sedelsberg", "Moorstraße 23"] },
    { id: "feldhaus", name: "Ausstellungsraum Autohaus Feldhaus", stichworte: ["Autohaus Feldhaus GmbH & Co. KG", "Friesoythe"] },
  ],
};

const ohneDoppeltenJan = { ...daten, mitarbeiter: daten.mitarbeiter.filter((m) => m.id !== "jan2") };

describe("normalisieren / abstand", () => {
  it("vereinheitlicht Umlaute und Satzzeichen", () => {
    expect(normalisieren("Lüken, Ringstraße!")).toBe("lueken ringstrasse");
  });
  it("zählt Tippfehler", () => {
    expect(abstand("luecken", "lueken")).toBe(1);
    expect(abstand("sebastian", "sebastian")).toBe(0);
  });
});

describe("einteilungErkennen", () => {
  it("versteht einen typischen Satz mit Füllwörtern", () => {
    const e = einteilungErkennen("ähm Sebastian und Christian mit Sprinter eins zu Gerdes", ohneDoppeltenJan);
    expect(e.gruppen).toEqual([{ fahrzeugId: "s1", projektId: "gerdes", mitarbeiterIds: ["seb", "chr"] }]);
    expect(e.hinweise).toEqual([]);
  });

  it("trennt mehrere Gruppen ohne Satzzeichen", () => {
    const e = einteilungErkennen(
      "Sebastian und Christian mit Sprinter 1 zu Gerdes Tobias und Marco mit Sprinter zwei nach Ringstraße",
      ohneDoppeltenJan,
    );
    expect(e.gruppen).toEqual([
      { fahrzeugId: "s1", projektId: "gerdes", mitarbeiterIds: ["seb", "chr"] },
      { fahrzeugId: "s2", projektId: "ring", mitarbeiterIds: ["tob", "mar"] },
    ]);
  });

  it("versteht auch die Reihenfolge Auto → Baustelle → Leute", () => {
    const e = einteilungErkennen("Caddy zu Kramer Marco und Tobias, Sprinter 2 Ringstraße Jan", ohneDoppeltenJan);
    expect(e.gruppen).toEqual([
      { fahrzeugId: "caddy", projektId: "kramer", mitarbeiterIds: ["mar", "tob"] },
      { fahrzeugId: "s2", projektId: "ring", mitarbeiterIds: ["jan"] },
    ]);
  });

  it("verzeiht Hörfehler bei Namen (Lücken statt Lüken, Sebastien)", () => {
    const e = einteilungErkennen("Sebastien und Lücken mit dem Caddy zu Gerdes", ohneDoppeltenJan);
    expect(e.gruppen[0]).toEqual({ fahrzeugId: "caddy", projektId: "gerdes", mitarbeiterIds: ["seb", "chr"] });
  });

  it("erkennt Baustellen über Kunde oder Ort", () => {
    const e = einteilungErkennen("Tobias Sprinter 1 Sedelsberg", ohneDoppeltenJan);
    expect(e.gruppen[0].projektId).toBe("kramer");
    const f = einteilungErkennen("Tobias Sprinter 1 Autohaus Feldhaus", ohneDoppeltenJan);
    expect(f.gruppen[0].projektId).toBe("feldhaus");
  });

  it("meldet doppelte Vornamen und nimmt den Nachnamen zur Unterscheidung", () => {
    const unklar = einteilungErkennen("Jan mit Sprinter 1 zu Gerdes", daten);
    expect(unklar.gruppen[0].mitarbeiterIds).toEqual([]);
    expect(unklar.hinweise.join(" ")).toContain("Nachnamen");
    const klar = einteilungErkennen("Jan Bruns mit Sprinter 1 zu Gerdes", daten);
    expect(klar.gruppen[0].mitarbeiterIds).toEqual(["jan2"]);
  });

  it("meldet mehrdeutige Autos ohne Nummer", () => {
    const e = einteilungErkennen("Sebastian Sprinter zu Gerdes", ohneDoppeltenJan);
    expect(e.gruppen[0].fahrzeugId).toBeNull();
    expect(e.hinweise.join(" ")).toContain("mehreren Autos");
  });

  it("mehrdeutiger Ort (Friesoythe) wird nur mit Zusatz eindeutig", () => {
    const e = einteilungErkennen("Marco Caddy Friesoythe", ohneDoppeltenJan);
    expect(e.gruppen[0].projektId).toBeNull();
    expect(e.hinweise.join(" ")).toContain("mehreren Baustellen");
    const f = einteilungErkennen("Marco Caddy Friesoythe Ringstraße", ohneDoppeltenJan);
    expect(f.gruppen[0].projektId).toBe("ring");
  });

  it("sagt Bescheid, wenn gar nichts erkannt wurde", () => {
    const e = einteilungErkennen("ähm ja also heute", ohneDoppeltenJan);
    expect(e.gruppen).toEqual([]);
    expect(e.hinweise[0]).toContain("keine");
  });
});
