import { crc32 } from "node:zlib";

/**
 * Packt Dateien in ein ZIP ohne Kompression („stored“). Rechnungs-PDFs sind schon komprimiert, also spart Kompression kaum etwas,
 * und so braucht es keine zusätzliche Bibliothek. Dateinamen werden als UTF-8 gespeichert (Umlaute bleiben erhalten).
 */
export function zipErzeugen(dateien: { name: string; inhalt: Uint8Array }[]): Buffer {
  const teile: Buffer[] = [];
  const zentral: Buffer[] = [];
  let versatz = 0;
  // DOS-Zeit/-Datum: fest auf 1.1.2026 0:00 (Inhalt zählt, nicht der Zeitstempel in der Datei)
  const dosZeit = 0;
  const dosDatum = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const datei of dateien) {
    const name = Buffer.from(datei.name, "utf8");
    const daten = Buffer.from(datei.inhalt);
    const pruefsumme = crc32(daten);

    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0);
    kopf.writeUInt16LE(20, 4); // nötige Version
    kopf.writeUInt16LE(0x0800, 6); // Bit 11: Name ist UTF-8
    kopf.writeUInt16LE(0, 8); // Methode 0 = ohne Kompression
    kopf.writeUInt16LE(dosZeit, 10);
    kopf.writeUInt16LE(dosDatum, 12);
    kopf.writeUInt32LE(pruefsumme, 14);
    kopf.writeUInt32LE(daten.length, 18);
    kopf.writeUInt32LE(daten.length, 22);
    kopf.writeUInt16LE(name.length, 26);
    kopf.writeUInt16LE(0, 28);
    teile.push(kopf, name, daten);

    const eintrag = Buffer.alloc(46);
    eintrag.writeUInt32LE(0x02014b50, 0);
    eintrag.writeUInt16LE(20, 4); // erzeugt mit Version
    eintrag.writeUInt16LE(20, 6);
    eintrag.writeUInt16LE(0x0800, 8);
    eintrag.writeUInt16LE(0, 10);
    eintrag.writeUInt16LE(dosZeit, 12);
    eintrag.writeUInt16LE(dosDatum, 14);
    eintrag.writeUInt32LE(pruefsumme, 16);
    eintrag.writeUInt32LE(daten.length, 20);
    eintrag.writeUInt32LE(daten.length, 24);
    eintrag.writeUInt16LE(name.length, 28);
    eintrag.writeUInt32LE(versatz, 42);
    zentral.push(eintrag, name);

    versatz += kopf.length + name.length + daten.length;
  }

  const zentralGroesse = zentral.reduce((s, b) => s + b.length, 0);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(dateien.length, 8);
  ende.writeUInt16LE(dateien.length, 10);
  ende.writeUInt32LE(zentralGroesse, 12);
  ende.writeUInt32LE(versatz, 16);
  return Buffer.concat([...teile, ...zentral, ende]);
}
