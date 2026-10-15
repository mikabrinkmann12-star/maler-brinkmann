// Erzeugt die App-Icons (Platzhalter „MB“) für Homescreen, Browser-Tab und iPhone.
//
//   npm run icons
//
// Später durch das echte Firmenlogo ersetzen: dieses Skript anpassen (z. B. Logo-
// SVG statt Text) und erneut ausführen. Die PNGs werden mit committet.

import { mkdirSync } from "node:fs";
import sharp from "sharp";

const HINTERGRUND = "#171717"; // = theme_color im Manifest
const SCHRIFT = "#ffffff";

type Art = {
  /** Abgerundete Ecken (normales Icon) oder volle Fläche (maskable/iPhone). */
  rund: boolean;
  /** Schriftgröße relativ zur Kantenlänge. Maskable kleiner wegen Beschnitt. */
  schrift: number;
};

function svg(groesse: number, { rund, schrift }: Art): string {
  const radius = rund ? groesse * 0.22 : 0;
  const pt = groesse * schrift;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${groesse}" height="${groesse}" viewBox="0 0 ${groesse} ${groesse}">
  <rect width="${groesse}" height="${groesse}" rx="${radius}" fill="${HINTERGRUND}"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
    font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${pt}"
    fill="${SCHRIFT}">MB</text>
</svg>`;
}

const NORMAL: Art = { rund: true, schrift: 0.42 };
const VOLL: Art = { rund: false, schrift: 0.42 };
// Maskable: Android schneidet bis zu 20 % Rand ab (Kreis/Tropfen) → Text kleiner.
const MASKABLE: Art = { rund: false, schrift: 0.3 };

const ZIELE: { datei: string; groesse: number; art: Art }[] = [
  { datei: "public/icons/icon-192.png", groesse: 192, art: NORMAL },
  { datei: "public/icons/icon-512.png", groesse: 512, art: NORMAL },
  { datei: "public/icons/icon-maskable-512.png", groesse: 512, art: MASKABLE },
  { datei: "src/app/icon.png", groesse: 64, art: NORMAL }, // Browser-Tab
  { datei: "src/app/apple-icon.png", groesse: 180, art: VOLL }, // iPhone rundet selbst
];

async function main() {
  mkdirSync("public/icons", { recursive: true });
  for (const { datei, groesse, art } of ZIELE) {
    await sharp(Buffer.from(svg(groesse, art))).png().toFile(datei);
    console.log(`✔ ${datei} (${groesse}×${groesse})`);
  }
}

main().catch((fehler: unknown) => {
  console.error(fehler);
  process.exit(1);
});
