import { describe, expect, it } from "vitest";
import { standardVorlage, vorlagenDerArt, vorlageSchema, type Textvorlage } from "./textvorlagen";

const v = (art: Textvorlage["art"], name: string, standard = false): Textvorlage => ({ id: name, art, name, inhalt: "x", standard });

describe("vorlageSchema", () => {
  const ok = { art: "einleitung", name: " Privatkunde ", inhalt: " Hallo ", standard: false };
  it("nimmt gültige Eingaben und schneidet Leerzeichen ab", () => {
    expect(vorlageSchema.parse(ok)).toEqual({ art: "einleitung", name: "Privatkunde", inhalt: "Hallo", standard: false });
  });
  it("lehnt ungültige Art, leeren Namen/Text und zu lange Eingaben ab", () => {
    expect(vorlageSchema.safeParse({ ...ok, art: "betreff" }).success).toBe(false);
    expect(vorlageSchema.safeParse({ ...ok, name: " " }).success).toBe(false);
    expect(vorlageSchema.safeParse({ ...ok, inhalt: "" }).success).toBe(false);
    expect(vorlageSchema.safeParse({ ...ok, name: "x".repeat(81) }).success).toBe(false);
    expect(vorlageSchema.safeParse({ ...ok, inhalt: "x".repeat(3001) }).success).toBe(false);
  });
});

describe("Auswahl", () => {
  const liste = [v("einleitung", "Gewerbe"), v("schlusstext", "Kurz"), v("einleitung", "Privat", true), v("einleitung", "Alt")];
  it("Standard zuerst, dann alphabetisch, getrennt nach Art", () => {
    expect(vorlagenDerArt(liste, "einleitung").map((x) => x.name)).toEqual(["Privat", "Alt", "Gewerbe"]);
    expect(vorlagenDerArt(liste, "schlusstext").map((x) => x.name)).toEqual(["Kurz"]);
  });
  it("findet die Standard-Vorlage einer Art oder null", () => {
    expect(standardVorlage(liste, "einleitung")?.name).toBe("Privat");
    expect(standardVorlage(liste, "schlusstext")).toBeNull();
  });
});
