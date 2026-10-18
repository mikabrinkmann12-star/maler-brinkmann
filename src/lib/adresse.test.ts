import { describe, expect, it } from "vitest";
import { adressSuchtext, ortAusNominatim, vorschlaegeAusPhoton } from "./adresse";

describe("vorschlaegeAusPhoton", () => {
  it("macht aus Hausnummer-Treffern Straße, PLZ, Ort und Land", () => {
    const v = vorschlaegeAusPhoton({
      features: [
        { properties: { street: "Hambierich", housenumber: "39", postcode: "26683", city: "Saterland", countrycode: "DE", country: "Germany", type: "house" } },
      ],
    });
    expect(v).toEqual([{ label: "Hambierich 39, 26683 Saterland, Deutschland", strasse: "Hambierich 39", plz: "26683", ort: "Saterland", land: "Deutschland" }]);
    // Koordinaten (Länge, Breite) werden für die Gemeinde-Abfrage mitgegeben
    expect(vorschlaegeAusPhoton({ features: [{ properties: { street: "A", city: "B", countrycode: "DE" }, geometry: { coordinates: [7.7, 53.06] } }] })[0]).toMatchObject({ breite: 53.06, laenge: 7.7 });
  });

  it("nimmt bei Straßen den Namen, Ort aus Stadt/Dorf/Ortsteil, ausländische Länder übersetzt", () => {
    const v = vorschlaegeAusPhoton({
      features: [
        { properties: { name: "Hambierich", type: "street", postcode: "26683", district: "Scharrel", countrycode: "DE" } },
        { properties: { street: "Hauptstraße", housenumber: "1", village: "Pöllau", postcode: "8225", countrycode: "AT" } },
        { properties: { street: "Rue X", city: "Paris", countrycode: "XX", country: "Atlantis" } },
      ],
    });
    expect(v.map((x) => x.label)).toEqual([
      "Hambierich, 26683 Scharrel, Deutschland",
      "Hauptstraße 1, 8225 Pöllau, Österreich",
      "Rue X, Paris, Atlantis",
    ]);
  });

  it("überspringt Treffer ohne Straße und Doppelte, begrenzt die Anzahl", () => {
    const gleich = { properties: { street: "A", housenumber: "1", city: "B", countrycode: "DE" } };
    expect(vorschlaegeAusPhoton({ features: [{ properties: { name: "Cafe", type: "house" } }, gleich, gleich] })).toHaveLength(1);
    const viele = Array.from({ length: 20 }, (_, i) => ({ properties: { street: `S${i}`, city: "X", countrycode: "DE" } }));
    expect(vorschlaegeAusPhoton({ features: viele }, 3)).toHaveLength(3);
    expect(vorschlaegeAusPhoton(null)).toEqual([]);
    expect(vorschlaegeAusPhoton({})).toEqual([]);
  });
});

describe("adressSuchtext", () => {
  it("bereinigt, braucht mindestens 3 Zeichen", () => {
    expect(adressSuchtext("  Hamb   39 ")).toBe("Hamb 39");
    expect(adressSuchtext("Ha")).toBe("");
    expect(adressSuchtext(null)).toBe("");
    expect(adressSuchtext("x".repeat(300))).toHaveLength(100);
  });
});

describe("ortAusNominatim", () => {
  it("bevorzugt die Gemeinde vor dem Ortsteil", () => {
    expect(ortAusNominatim({ address: { village: "Scharrel", municipality: "Saterland", postcode: "26683" } })).toBe("Saterland");
    expect(ortAusNominatim({ address: { town: "Leer" } })).toBe("Leer");
    expect(ortAusNominatim({})).toBe("");
    expect(ortAusNominatim(null)).toBe("");
  });
});
