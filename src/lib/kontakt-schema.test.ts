import { describe, expect, it } from "vitest";
import { briefanschrift, importKontaktSchema, kontaktAnzeigename, kontaktSchema } from "./kontakt-schema";

describe("kontaktSchema", () => {
  it("nimmt einen Privatkunden an, leere Felder bleiben leer, leere Kundennummer wird null", () => {
    const k = kontaktSchema.parse({ typ: "privat", nachname: " Muster ", kundennummer: "  " });
    expect(k).toMatchObject({ nachname: "Muster", vorname: "", email: "", kundennummer: null });
  });

  it("verlangt Firmenname oder Nachname und eine gültige E-Mail", () => {
    expect(kontaktSchema.safeParse({ typ: "privat", vorname: "Erika" }).success).toBe(false);
    expect(kontaktSchema.safeParse({ typ: "firma", firmenname: "Musterbau GmbH" }).success).toBe(true);
    expect(kontaktSchema.safeParse({ typ: "privat", nachname: "M", email: "keine-mail" }).success).toBe(false);
  });

  it("Steuersatz 0/7/19 (Standard 19), Skonto nur mit Prozent und Tagen", () => {
    expect(kontaktSchema.parse({ typ: "privat", nachname: "M" }).steuersatz).toBe(19);
    expect(kontaktSchema.safeParse({ typ: "privat", nachname: "M", steuersatz: 16 }).success).toBe(false);
    expect(kontaktSchema.safeParse({ typ: "privat", nachname: "M", skonto_prozent: 2 }).success).toBe(false);
    expect(kontaktSchema.safeParse({ typ: "privat", nachname: "M", skonto_prozent: 2, skonto_tage: 10, zahlungsziel_tage: 14 }).success).toBe(true);
    expect(kontaktSchema.safeParse({ typ: "privat", nachname: "M", zahlungsziel_tage: 400 }).success).toBe(false);
  });

  it("Import ist bei der E-Mail großzügig", () => {
    expect(importKontaktSchema.safeParse({ typ: "privat", nachname: "M", email: "keine-mail" }).success).toBe(true);
  });
});

describe("Anzeigename und Briefanschrift", () => {
  it("zeigt Firma oder Vor- und Nachname", () => {
    expect(kontaktAnzeigename({ firmenname: "Musterbau GmbH", nachname: "X" })).toBe("Musterbau GmbH");
    expect(kontaktAnzeigename({ vorname: "Erika", nachname: "Muster" })).toBe("Erika Muster");
    expect(kontaktAnzeigename({})).toBe("Ohne Namen");
  });

  it("baut die Briefanschrift für Privat und Firma", () => {
    expect(briefanschrift({ typ: "privat", anrede: "Frau", vorname: "Erika", nachname: "Muster", strasse: "Weg 1", plz: "26683", ort: "Saterland" }))
      .toEqual(["Frau", "Erika Muster", "Weg 1", "26683 Saterland"]);
    expect(briefanschrift({ typ: "privat", nachname: "Muster", empfaenger: "Familie Muster\n\n Weg 1 " })).toEqual(["Familie Muster", "Weg 1"]);
    expect(briefanschrift({ typ: "firma", firmenname: "Musterbau GmbH", ansprechpartner: "Hans Beispiel", strasse: "Weg 2", plz: "26169", ort: "Friesoythe" }))
      .toEqual(["Musterbau GmbH", "z. Hd. Hans Beispiel", "Weg 2", "26169 Friesoythe"]);
  });
});
