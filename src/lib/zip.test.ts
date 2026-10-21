import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { zipErzeugen } from "./zip";

describe("zipErzeugen", () => {
  it("schreibt ein gültiges ZIP mit Namen, Größen und Prüfsummen", () => {
    const zip = zipErzeugen([
      { name: "Rechnung_R-1.pdf", inhalt: Buffer.from("%PDF-1.4 eins") },
      { name: "Rechnung_Müller.pdf", inhalt: Buffer.from("zwei") },
    ]);
    // Ende des Verzeichnisses: zwei Einträge
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(2);
    expect(zip.includes(Buffer.from("Rechnung_Müller.pdf", "utf8"))).toBe(true);
  });

  it("trägt Größe und Prüfsumme des ersten Eintrags ein", () => {
    const inhalt = Buffer.from("Hallo Welt");
    const zip = zipErzeugen([{ name: "a.txt", inhalt }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(14)).toBe(crc32(inhalt));
    expect(zip.readUInt32LE(18)).toBe(inhalt.length);
    expect(zip.subarray(30 + 5, 30 + 5 + inhalt.length).toString()).toBe("Hallo Welt");
  });

  it("packt eine leere Liste", () => {
    expect(zipErzeugen([]).length).toBe(22);
  });
});
