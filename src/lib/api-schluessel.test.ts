import { describe, expect, it } from "vitest";
import { darf, hashVon, istSchluesselFormat, schluesselAusAnfrage, schluesselErzeugen } from "./api-schluessel";

const kopf = (werte: Record<string, string>) => ({ get: (n: string) => werte[n.toLowerCase()] ?? null });

describe("schluesselErzeugen", () => {
  it("hat das erwartete Format und einen passenden Hash", () => {
    const s = schluesselErzeugen();
    expect(istSchluesselFormat(s.klartext)).toBe(true);
    expect(s.hash).toBe(hashVon(s.klartext));
    expect(s.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.klartext.startsWith(s.prefix)).toBe(true);
  });
  it("jeder Schlüssel ist anders", () => {
    expect(schluesselErzeugen().klartext).not.toBe(schluesselErzeugen().klartext);
  });
});

describe("istSchluesselFormat", () => {
  it("lehnt Fremdes ab", () => {
    expect(istSchluesselFormat("")).toBe(false);
    expect(istSchluesselFormat("mbk_abc")).toBe(false);
    expect(istSchluesselFormat(`mbk_${"g".repeat(48)}`)).toBe(false);
    expect(istSchluesselFormat(`xyz_${"a".repeat(48)}`)).toBe(false);
  });
});

describe("schluesselAusAnfrage", () => {
  it("liest Bearer und X-API-Key", () => {
    expect(schluesselAusAnfrage(kopf({ authorization: "Bearer mbk_abc" }))).toBe("mbk_abc");
    expect(schluesselAusAnfrage(kopf({ authorization: "bearer   mbk_abc" }))).toBe("mbk_abc");
    expect(schluesselAusAnfrage(kopf({ "x-api-key": " mbk_xyz " }))).toBe("mbk_xyz");
  });
  it("ohne Schlüssel leer", () => {
    expect(schluesselAusAnfrage(kopf({}))).toBe("");
    expect(schluesselAusAnfrage(kopf({ authorization: "Basic abc" }))).toBe("");
  });
});

describe("darf", () => {
  it("Rechte werden ausdrücklich vergeben", () => {
    expect(darf(["lesen"], "lesen")).toBe(true);
    expect(darf(["lesen"], "schreiben")).toBe(false);
    expect(darf(["schreiben"], "lesen")).toBe(false);
    expect(darf(["lesen", "schreiben"], "schreiben")).toBe(true);
  });
});
