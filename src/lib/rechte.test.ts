import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLE_RECHTE, RECHT_SCHLUESSEL, rechtDef, rechtOk, rechteAusZeilen, standardRechte, stufeErlaubt } from "./rechte";

describe("Katalog", () => {
  it("jeder Schlüssel kommt nur einmal vor", () => {
    expect(new Set(RECHT_SCHLUESSEL).size).toBe(RECHT_SCHLUESSEL.length);
  });
  it("Voreinstellungen liegen immer in den wählbaren Stufen", () => {
    for (const r of ALLE_RECHTE) {
      expect(r.buero, r.schluessel).toContain(r.standard.buero);
      if (r.mitarbeiter) expect(r.mitarbeiter, r.schluessel).toContain(r.standard.mitarbeiter);
      else expect(r.standard.mitarbeiter, r.schluessel).toBe("nein");
    }
  });
  it("Rechte, die Admin-Macht verleihen, gibt es für Mitarbeiter nie", () => {
    for (const r of ALLE_RECHTE.filter((x) => x.verleih)) {
      expect(r.mitarbeiter, r.schluessel).toBeNull();
      expect(r.standard.buero, r.schluessel).toBe("nein");
    }
  });
  it("Büro hat nie „eigene“ (das gibt es nur für Mitarbeiter)", () => {
    for (const r of ALLE_RECHTE) expect(r.buero).not.toContain("eigene");
  });
});

describe("Gleichlauf mit der Migration", () => {
  const sql = readFileSync("supabase/migrations/20261020180000_rechte.sql", "utf8");
  it("dieselben Schlüssel in der CHECK-Regel", () => {
    const check = /role_permissions_recht_check check \(recht in \(([^)]*)\)\)/.exec(sql)?.[1] ?? "";
    const keys = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual([...RECHT_SCHLUESSEL].sort());
  });
  it("dieselben Voreinstellungen in den eingetragenen Zeilen", () => {
    const zeilen = [...sql.matchAll(/\('(buero|mitarbeiter)', '([a-z_]+)', '(nein|eigene|ja)', null\)/g)];
    expect(zeilen.length).toBe(RECHT_SCHLUESSEL.length * 2);
    for (const [, rolle, key, stufe] of zeilen) {
      expect(standardRechte(rolle as "buero" | "mitarbeiter")[key], `${rolle}/${key}`).toBe(stufe);
    }
  });
});

describe("rechteAusZeilen / rechtOk", () => {
  it("Admin hat alles", () => {
    const r = rechteAusZeilen("admin", []);
    expect(rechtOk(r, "katalog")).toBe(true);
    expect(rechtOk(r, "urlaub_genehmigen")).toBe(true);
  });
  it("fehlende Zeile oder unbekannte Stufe heißt nein", () => {
    const r = rechteAusZeilen("buero", [{ recht: "katalog", stufe: "ja" }, { recht: "angebote", stufe: "quatsch" }]);
    expect(rechtOk(r, "katalog")).toBe(true);
    expect(rechtOk(r, "angebote")).toBe(false);
    expect(rechtOk(r, "rechnungen")).toBe(false);
    expect(rechtOk(r, "gibt_es_nicht")).toBe(false);
    expect(rechtOk(undefined, "katalog")).toBe(false);
  });
  it("Büro-Funktionen bekommen Mitarbeiter nie, auch nicht über die Datenbank", () => {
    const r = rechteAusZeilen("mitarbeiter", [{ recht: "katalog", stufe: "ja" }, { recht: "urlaub_genehmigen", stufe: "ja" }]);
    expect(rechtOk(r, "katalog")).toBe(false);
    expect(rechtOk(r, "urlaub_genehmigen")).toBe(false);
  });
  it("eigene zählt als an", () => {
    expect(rechtOk(rechteAusZeilen("mitarbeiter", [{ recht: "chat", stufe: "eigene" }]), "chat")).toBe(true);
  });
});

describe("stufeErlaubt", () => {
  it("prüft gegen die wählbaren Stufen der Rolle", () => {
    expect(stufeErlaubt("buero", "katalog", "ja")).toBe(true);
    expect(stufeErlaubt("buero", "katalog", "eigene")).toBe(false);
    expect(stufeErlaubt("mitarbeiter", "chat", "eigene")).toBe(true);
    expect(stufeErlaubt("mitarbeiter", "chat", "ja")).toBe(false);
    expect(stufeErlaubt("mitarbeiter", "archiv_ansehen", "ja")).toBe(true);
  });
  it("Mitarbeiter bekommen Büro-Rechte nie, nur „nein“ ist erlaubt", () => {
    expect(stufeErlaubt("mitarbeiter", "katalog", "ja")).toBe(false);
    expect(stufeErlaubt("mitarbeiter", "katalog", "nein")).toBe(true);
    expect(stufeErlaubt("mitarbeiter", "urlaub_genehmigen", "ja")).toBe(false);
  });
  it("Admin ist nicht einstellbar, unbekannte Rechte und Stufen auch nicht", () => {
    expect(stufeErlaubt("admin", "katalog", "nein")).toBe(false);
    expect(stufeErlaubt("buero", "gibt_es_nicht", "ja")).toBe(false);
    expect(stufeErlaubt("buero", "katalog", "vielleicht")).toBe(false);
    expect(rechtDef("katalog")?.name).toContain("Katalog");
  });
});
