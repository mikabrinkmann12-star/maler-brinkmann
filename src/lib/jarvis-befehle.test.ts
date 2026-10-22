import { describe, expect, it } from "vitest";
import { befehlErkennen, JARVIS_BEISPIELE, type JarvisDaten } from "./jarvis-befehle";

const daten: JarvisDaten = {
  mitarbeiter: [
    { id: "m-seb", vorname: "Sebastian", nachname: "Beispiel" },
    { id: "m-jan", vorname: "Jan", nachname: "Muster" },
    { id: "m-chr", vorname: "Christian", nachname: "Probe" },
    { id: "m-kar", vorname: "Karin", nachname: "Zweite" },
    { id: "m-tob", vorname: "Tobias", nachname: "Test" },
  ],
  fahrzeuge: [
    { id: "f-s1", name: "Sprinter 1", kennzeichen: null },
    { id: "f-s2", name: "Sprinter 2", kennzeichen: null },
    { id: "f-cad", name: "Caddy", kennzeichen: null },
  ],
  projekte: [
    { id: "p-ger", name: "Wohnhaus Gerdes", stichworte: ["Gerdes", "Ramsloh", "Dorfstraße"] },
    { id: "p-ring", name: "Treppenhaus Ringstraße", stichworte: ["Hoffmann", "Friesoythe", "Ringstraße"] },
    { id: "p-kra", name: "Fassade Kramer", stichworte: ["Kramer", "Scharrel", "Hauptstraße"] },
    { id: "p-mey1", name: "Wohnung Meyer", stichworte: ["Meyer", "Barßel"] },
    { id: "p-mey2", name: "Büro Meyer", stichworte: ["Meyer", "Cloppenburg"] },
  ],
};

const art = (text: string) => befehlErkennen(text, daten).befehl;

describe("Container", () => {
  it("erkennt Papier und Restmüll", () => {
    expect(art("Papiercontainer melden")).toEqual({ art: "container", container: "papier" });
    expect(art("Der Container für Papier ist voll")).toEqual({ art: "container", container: "papier" });
    expect(art("Restmüllcontainer melden")).toEqual({ art: "container", container: "restmuell" });
    expect(art("ähm Jarvis, bitte den Restmüll Container melden")).toEqual({ art: "container", container: "restmuell" });
  });

  it("fragt nach, wenn die Art fehlt oder beides genannt wird", () => {
    expect(art("Container melden").art).toBe("nachfrage");
    expect(art("Papier und Restmüll Container melden").art).toBe("nachfrage");
  });
});

describe("Notiz", () => {
  it("findet Baustelle und Text mit Doppelpunkt", () => {
    expect(art("Notiz bei Gerdes: Gerüst steht")).toEqual({ art: "notiz", projektId: "p-ger", text: "Gerüst steht" });
  });

  it("findet Baustelle und Text ohne Satzzeichen (gesprochen)", () => {
    expect(art("Notiz zu Kramer die Fassade ist fertig")).toEqual({ art: "notiz", projektId: "p-kra", text: "Die Fassade ist fertig" });
    expect(art("notiere bei Gerdes dass der Kunde Farbe wünscht")).toEqual({ art: "notiz", projektId: "p-ger", text: "Der Kunde Farbe wünscht" });
  });

  it("nimmt zwei Wörter, wenn eins nicht reicht", () => {
    // „Meyer“ allein passt zu zwei Baustellen, mit Ort ist es eindeutig
    expect(art("Notiz bei Meyer Barßel: Tür streichen")).toEqual({ art: "notiz", projektId: "p-mey1", text: "Tür streichen" });
  });

  it("fragt nach bei mehrdeutiger oder unbekannter Baustelle und leerem Text", () => {
    const mehrdeutig = art("Notiz bei Meyer: Tür streichen");
    expect(mehrdeutig.art).toBe("nachfrage");
    // beide Meyer-Baustellen stehen zur Auswahl, der Text der Notiz bleibt erhalten
    expect(mehrdeutig).toMatchObject({ projektIds: expect.arrayContaining(["p-mey1", "p-mey2"]), dann: { art: "notiz", text: "Tür streichen" } });
    const unbekannt = art("Notiz bei Zimmermann: Tür streichen");
    expect(unbekannt.art).toBe("nachfrage");
    expect(art("Notiz bei Gerdes").art).toBe("nachfrage");
    expect(art("Notiz").art).toBe("nachfrage");
  });

  it("hält eine Notiz nicht für eine Einteilung", () => {
    expect(art("Notiz bei Gerdes: Sebastian mit Sprinter 1 war da").art).toBe("notiz");
  });
});

describe("Einteilung", () => {
  it("erkennt Personen mit Auto und Baustelle", () => {
    const b = art("Sebastian und Jan mit Sprinter 1 zu Gerdes");
    expect(b.art).toBe("einteilung");
    if (b.art !== "einteilung") return;
    expect(b.tage).toBe(0);
    expect(b.gruppen).toEqual([{ fahrzeugId: "f-s1", projektId: "p-ger", mitarbeiterIds: ["m-seb", "m-jan"] }]);
  });

  it("erkennt „morgen“", () => {
    const b = art("morgen Tobias mit dem Caddy zu Kramer");
    expect(b.art === "einteilung" && b.tage).toBe(1);
  });
});

describe("Nachsehen", () => {
  it("wer ist wo", () => {
    expect(art("Wer ist heute wo?")).toEqual({ art: "heute_wo", tage: 0 });
    expect(art("Wer fährt morgen wohin")).toEqual({ art: "heute_wo", tage: 1 });
    expect(art("Einsätze übermorgen")).toEqual({ art: "heute_wo", tage: 2 });
  });

  it("Resturlaub einer Person", () => {
    expect(art("Wie viele Urlaubstage hat Sebastian noch?")).toEqual({ art: "urlaub_rest", mitarbeiterId: "m-seb" });
    expect(art("Resturlaub von Jan")).toEqual({ art: "urlaub_rest", mitarbeiterId: "m-jan" });
  });

  it("Resturlaub fragt nach, wenn die Person fehlt oder mehrdeutig ist", () => {
    expect(art("Wie viele Urlaubstage sind noch übrig?").art).toBe("nachfrage");
    // zwei Personen mit demselben Vornamen: nicht raten
    const doppelt: JarvisDaten = {
      ...daten,
      mitarbeiter: [...daten.mitarbeiter, { id: "m-jan2", vorname: "Jan", nachname: "Zweiter" }],
    };
    expect(befehlErkennen("Wie viele Urlaubstage hat Jan noch?", doppelt).befehl.art).toBe("nachfrage");
  });

  it("was ist offen", () => {
    expect(art("Was ist offen?")).toEqual({ art: "offen" });
    expect(art("Was gibt es zu tun")).toEqual({ art: "offen" });
    expect(art("Offene Aufgaben")).toEqual({ art: "offen" });
  });
});

describe("Projekt öffnen", () => {
  it("findet das Projekt", () => {
    expect(art("Projekt Gerdes öffnen")).toEqual({ art: "projekt_oeffnen", projektId: "p-ger" });
    expect(art("zeig mir die Baustelle Kramer")).toEqual({ art: "projekt_oeffnen", projektId: "p-kra" });
  });

  it("fragt nach, wenn das Projekt fehlt oder mehrdeutig ist", () => {
    expect(art("Projekt öffnen").art).toBe("nachfrage");
    expect(art("Projekt Meyer öffnen")).toMatchObject({ art: "nachfrage", projektIds: expect.arrayContaining(["p-mey1", "p-mey2"]), dann: { art: "projekt_oeffnen" } });
  });
});

describe("Unbekanntes", () => {
  it("sagt „unbekannt“, statt zu raten", () => {
    expect(art("Wie wird das Wetter").art).toBe("unbekannt");
    expect(art("").art).toBe("unbekannt");
    expect(art("ähm also").art).toBe("unbekannt");
    expect(art("Gerdes").art).toBe("unbekannt");
  });

  it("jedes Beispiel wird erkannt", () => {
    for (const beispiel of JARVIS_BEISPIELE) {
      const b = art(beispiel);
      expect(b.art, beispiel).not.toBe("unbekannt");
      expect(b.art, beispiel).not.toBe("nachfrage");
    }
  });
});
