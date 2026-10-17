import { describe, expect, it } from "vitest";
import { MAIL_STANDARD_BETREFF, MAIL_STANDARD_TEXT, betreffBereinigen, mailPlatzhalter, mailSchema } from "./angebot-mail";

const werte = { betreff: "Haus 2", kunde: "Rolfes GmbH", firma: "Maler Betrieb Brinkmann" };

describe("mailPlatzhalter", () => {
  it("ersetzt alle drei Platzhalter, auch mehrfach, und lässt Unbekanntes stehen", () => {
    expect(mailPlatzhalter(MAIL_STANDARD_BETREFF, werte)).toBe("Angebot: Haus 2");
    expect(mailPlatzhalter("{kunde} / {kunde} {unbekannt}", werte)).toBe("Rolfes GmbH / Rolfes GmbH {unbekannt}");
    const text = mailPlatzhalter(MAIL_STANDARD_TEXT, werte);
    expect(text).toContain("„Haus 2“");
    expect(text.endsWith("Maler Betrieb Brinkmann")).toBe(true);
  });
});

describe("mailSchema", () => {
  const ok = { an: " kunde@example.com ", betreff: "Angebot", text: "Hallo" };
  it("nimmt eine gültige Eingabe und schneidet Leerzeichen ab", () => {
    expect(mailSchema.parse(ok).an).toBe("kunde@example.com");
  });
  it("lehnt ungültige Adressen, leere Felder und zu lange Texte ab", () => {
    expect(mailSchema.safeParse({ ...ok, an: "kein-at" }).success).toBe(false);
    expect(mailSchema.safeParse({ ...ok, an: "a@b.de, c@d.de" }).success).toBe(false);
    expect(mailSchema.safeParse({ ...ok, betreff: " " }).success).toBe(false);
    expect(mailSchema.safeParse({ ...ok, text: "" }).success).toBe(false);
    expect(mailSchema.safeParse({ ...ok, text: "x".repeat(5001) }).success).toBe(false);
  });
});

describe("betreffBereinigen", () => {
  it("entfernt Zeilenumbrüche", () => {
    expect(betreffBereinigen("Angebot\r\nBcc: fremd@example.com")).toBe("Angebot Bcc: fremd@example.com");
  });
});
