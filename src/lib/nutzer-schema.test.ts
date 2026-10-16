import { describe, expect, it } from "vitest";
import { ersteMeldung, neuerNutzerSchema, stammdatenSchema } from "./nutzer-schema";
import { startpasswortErzeugen } from "./passwort";

const gueltig = {
  vorname: " Sebastian ",
  nachname: "Meyer",
  rolle: "mitarbeiter",
  telefon: "",
  email: "",
  benutzername: "Sebastian",
  passwort: "Pinsel-Deich-Walze-47",
};

describe("neuerNutzerSchema", () => {
  it("akzeptiert gültige Eingaben und bereinigt sie", () => {
    const ergebnis = neuerNutzerSchema.parse(gueltig);
    expect(ergebnis.vorname).toBe("Sebastian");
    expect(ergebnis.benutzername).toBe("sebastian");
    expect(ergebnis.email).toBe("");
  });

  it("verlangt einen Vornamen", () => {
    const r = neuerNutzerSchema.safeParse({ ...gueltig, vorname: "  " });
    expect(r.success).toBe(false);
    expect(ersteMeldung(r.error!)).toBe("Bitte einen Vornamen eingeben.");
  });

  it("lehnt Benutzernamen mit Umlaut oder Leerzeichen ab", () => {
    expect(neuerNutzerSchema.safeParse({ ...gueltig, benutzername: "jürgen" }).success).toBe(false);
    expect(neuerNutzerSchema.safeParse({ ...gueltig, benutzername: "hans peter" }).success).toBe(false);
  });

  it("lehnt zu kurze Startpasswörter ab", () => {
    const r = neuerNutzerSchema.safeParse({ ...gueltig, passwort: "kurz" });
    expect(r.success).toBe(false);
    expect(ersteMeldung(r.error!)).toContain("mindestens 10 Zeichen");
  });

  it("lehnt unbekannte Rollen ab", () => {
    expect(neuerNutzerSchema.safeParse({ ...gueltig, rolle: "chef" }).success).toBe(false);
  });
});

describe("stammdatenSchema", () => {
  it("prüft die E-Mail nur, wenn eine eingegeben wurde", () => {
    expect(stammdatenSchema.safeParse({ ...gueltig, email: "" }).success).toBe(true);
    expect(stammdatenSchema.safeParse({ ...gueltig, email: "a@b.de" }).success).toBe(true);
    expect(stammdatenSchema.safeParse({ ...gueltig, email: "keine-mail" }).success).toBe(false);
  });
});

describe("startpasswortErzeugen", () => {
  it("erzeugt lesbare Passwörter mit mindestens 10 Zeichen", () => {
    for (let i = 0; i < 50; i++) {
      const pw = startpasswortErzeugen();
      expect(pw).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-[A-Z][a-z]+-[1-9]\d$/);
      expect(pw.length).toBeGreaterThanOrEqual(10);
    }
  });

  it("erzeugt unterschiedliche Passwörter", () => {
    const menge = new Set(Array.from({ length: 20 }, startpasswortErzeugen));
    expect(menge.size).toBeGreaterThan(15);
  });
});

describe("Urlaubstage", () => {
  const basis = { vorname: "Jan", rolle: "mitarbeiter" };
  it("leer = nicht eingetragen, sonst 0 bis 60", () => {
    expect(stammdatenSchema.parse(basis).urlaubstage).toBeNull();
    expect(stammdatenSchema.parse({ ...basis, urlaubstage: "28" }).urlaubstage).toBe(28);
    expect(stammdatenSchema.safeParse({ ...basis, urlaubstage: "61" }).success).toBe(false);
    expect(stammdatenSchema.safeParse({ ...basis, urlaubstage: "2,5" }).success).toBe(false);
  });
});
