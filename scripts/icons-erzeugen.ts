// Erzeugt aus dem Firmenlogo (scripts/logo-quelle.png) das Logo für die Oberfläche (public/logo.png)
// und die App-Icons für Homescreen, Browser-Tab und iPhone.
//
//   npm run icons
//
// Anderes Logo: scripts/logo-quelle.png austauschen und das Skript erneut ausführen.
// Die PNGs werden mit committet.

import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const QUELLE = "scripts/logo-quelle.png";
const HINTERGRUND = "#ffffff";

type Art = {
  /** Abgerundete Ecken (normales Icon) oder volle Fläche (maskable/iPhone). */
  rund: boolean;
  /** Breite des Logos relativ zur Kantenlänge. Maskable kleiner wegen Beschnitt. */
  logo: number;
};

const NORMAL: Art = { rund: true, logo: 0.86 };
const VOLL: Art = { rund: false, logo: 0.8 };
// Maskable: Android schneidet bis zu 20 % Rand ab (Kreis/Tropfen) → Logo kleiner.
const MASKABLE: Art = { rund: false, logo: 0.62 };

const ZIELE: { datei: string; groesse: number; art: Art }[] = [
  { datei: "public/icons/icon-192.png", groesse: 192, art: NORMAL },
  { datei: "public/icons/icon-512.png", groesse: 512, art: NORMAL },
  { datei: "public/icons/icon-maskable-512.png", groesse: 512, art: MASKABLE },
  { datei: "src/app/icon.png", groesse: 64, art: NORMAL }, // Browser-Tab
  { datei: "src/app/apple-icon.png", groesse: 180, art: VOLL }, // iPhone rundet selbst
];

async function icon(groesse: number, { rund, logo }: Art): Promise<Buffer> {
  const breite = Math.round(groesse * logo);
  const bild = await sharp(QUELLE).resize({ width: breite }).png().toBuffer();
  const hoehe = (await sharp(bild).metadata()).height ?? breite;
  const grund = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${groesse}" height="${groesse}"><rect width="${groesse}" height="${groesse}" rx="${rund ? groesse * 0.22 : 0}" fill="${HINTERGRUND}"/></svg>`,
  );
  return sharp(grund)
    .composite([{ input: bild, left: Math.round((groesse - breite) / 2), top: Math.round((groesse - hoehe) / 2) }])
    .png()
    .toBuffer();
}

async function main() {
  mkdirSync("public/icons", { recursive: true });
  await sharp(QUELLE).resize({ width: 700 }).png({ compressionLevel: 9 }).toFile("public/logo.png");
  console.log("✔ public/logo.png (Logo für die Oberfläche)");
  for (const { datei, groesse, art } of ZIELE) {
    await writeFile(datei, await icon(groesse, art));
    console.log(`✔ ${datei} (${groesse}×${groesse})`);
  }
}

main().catch((fehler: unknown) => {
  console.error(fehler);
  process.exit(1);
});
