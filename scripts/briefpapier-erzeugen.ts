// Erzeugt das zweiseitige Briefpapier-PDF für Lexware (Einstellungen → Drucklayout → Logo & Briefpapier):
// Seite 1 = erste Belegseite mit großem Logo oben rechts, Seite 2 = Folgeseiten mit kleinem Logo oben rechts (wie die Rechnung in Plancraft).
// Alles andere (Anschrift, Firmenblock, Fußzeile mit Bank/USt-ID, Tabelle) druckt Lexware selbst.
// Aufruf: npx tsx scripts/briefpapier-erzeugen.ts <Ausgabedatei.pdf>
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const MM = 72 / 25.4;
const A4 = { b: 210 * MM, h: 297 * MM };

async function main() {
  const ziel = process.argv[2];
  if (!ziel) throw new Error("Bitte die Ausgabedatei angeben.");
  // JPEG hält die Datei klein (das Logo hat einen weißen Grund)
  const jpeg = await sharp(readFileSync("scripts/logo-quelle.png")).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();

  const doc = await PDFDocument.create();
  doc.setTitle("Briefpapier Maler Betrieb Brinkmann");
  doc.setProducer("Maler Brinkmann");
  const logo = await doc.embedJpg(jpeg);
  const verhaeltnis = logo.height / logo.width;

  const zeichne = (breiteMm: number, rechtsMm: number, obenMm: number) => {
    const seite = doc.addPage([A4.b, A4.h]);
    const b = breiteMm * MM;
    const h = b * verhaeltnis;
    seite.drawImage(logo, { x: A4.b - rechtsMm * MM - b, y: A4.h - obenMm * MM - h, width: b, height: h });
  };

  // Seite 1: Logo wie in der Plancraft-Rechnung (rund 55 mm breit, rechter Rand 18 mm, 20 mm von oben)
  zeichne(55, 18, 20);
  // Seite 2: kleines Logo (rund 27 mm breit) oben rechts
  zeichne(27, 18, 12);

  writeFileSync(ziel, await doc.save());
  console.log("ok", ziel);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
