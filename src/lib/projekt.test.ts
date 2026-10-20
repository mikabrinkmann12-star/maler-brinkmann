import { describe, expect, it } from "vitest";
import { adresseText, appleMapsLink, kontaktName, mailLink, mapsLink, telLink } from "./projekt";

describe("adresseText / mapsLink", () => {
  it("baut die Adresse zusammen und lässt Leeres weg", () => {
    expect(adresseText({ strasse: "Birkenweg 7", plz: "26683", ort: "Saterland-Scharrel" }))
      .toBe("Birkenweg 7, 26683 Saterland-Scharrel");
    expect(adresseText({ ort: "Friesoythe" })).toBe("Friesoythe");
    expect(adresseText({})).toBe("");
  });

  it("baut einen Google-Maps-Link, ohne Adresse keinen", () => {
    expect(mapsLink({ strasse: "Ringstraße 14", plz: "26169", ort: "Friesoythe" }))
      .toBe("https://www.google.com/maps/search/?api=1&query=Ringstra%C3%9Fe%2014%2C%2026169%20Friesoythe");
    expect(mapsLink({})).toBeNull();
  });
});

describe("telLink", () => {
  it("entfernt Leerzeichen und Zeichen, behält das +", () => {
    expect(telLink("040 66969 111")).toBe("tel:04066969111");
    expect(telLink("+49 (4498) 12-34")).toBe("tel:+4944981234");
    expect(telLink("")).toBeNull();
    expect(telLink(null)).toBeNull();
  });
});

describe("kontaktName", () => {
  it("nimmt die Firma, sonst Vor- und Nachname", () => {
    expect(kontaktName({ firmenname: "Autohaus Feldhaus", nachname: "X" })).toBe("Autohaus Feldhaus");
    expect(kontaktName({ vorname: "Thomas", nachname: "Gerdes" })).toBe("Thomas Gerdes");
    expect(kontaktName(null)).toBe("");
  });
});

describe("appleMapsLink und mailLink", () => {
  it("baut den Apple-Karten-Link", () => {
    expect(appleMapsLink({ strasse: "Birkenweg 7", ort: "Saterland" })).toBe("https://maps.apple.com/?q=Birkenweg%207%2C%20Saterland");
    expect(appleMapsLink({})).toBeNull();
  });
  it("mailto nur bei plausibler Adresse", () => {
    expect(mailLink(" a@b.de ")).toBe("mailto:a@b.de");
    expect(mailLink("kein mail")).toBeNull();
    expect(mailLink(null)).toBeNull();
  });
});
