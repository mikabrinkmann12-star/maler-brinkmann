import { describe, expect, it } from "vitest";
import {
  benutzernameVorschlag,
  benutzernameZuLoginEmail,
  istGueltigerBenutzername,
} from "./login";

const DOMAIN = "login.maler-brinkmann.de";

describe("benutzernameZuLoginEmail", () => {
  it("baut die interne Login-Adresse", () => {
    expect(benutzernameZuLoginEmail("sebastian", DOMAIN)).toBe(
      "sebastian@login.maler-brinkmann.de",
    );
  });

  it("ignoriert Groß-/Kleinschreibung und Leerzeichen", () => {
    expect(benutzernameZuLoginEmail("  Sebastian ", DOMAIN)).toBe(
      "sebastian@login.maler-brinkmann.de",
    );
  });

  it("lehnt ungültige Benutzernamen ab", () => {
    expect(() => benutzernameZuLoginEmail("a", DOMAIN)).toThrow();
    expect(() => benutzernameZuLoginEmail("seb@stian", DOMAIN)).toThrow();
    expect(() => benutzernameZuLoginEmail("jürgen", DOMAIN)).toThrow();
    expect(() => benutzernameZuLoginEmail("", DOMAIN)).toThrow();
  });

  it("lehnt eine fehlende oder falsche Domain ab", () => {
    expect(() => benutzernameZuLoginEmail("sebastian", "")).toThrow();
    expect(() => benutzernameZuLoginEmail("sebastian", "x@y.de")).toThrow();
  });
});

describe("istGueltigerBenutzername", () => {
  it("erlaubt Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich", () => {
    expect(istGueltigerBenutzername("sebastian.m")).toBe(true);
    expect(istGueltigerBenutzername("christian-2")).toBe(true);
    expect(istGueltigerBenutzername(".sebastian")).toBe(false);
    expect(istGueltigerBenutzername("a".repeat(32))).toBe(false);
  });
});

describe("benutzernameVorschlag", () => {
  it("wandelt Umlaute und Sonderzeichen um", () => {
    expect(benutzernameVorschlag("Jürgen")).toBe("juergen");
    expect(benutzernameVorschlag("Grußmann")).toBe("grussmann");
    expect(benutzernameVorschlag("Hans Peter")).toBe("hans.peter");
    expect(benutzernameVorschlag("André")).toBe("andre");
  });
});
