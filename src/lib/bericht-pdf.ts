// Bericht (Bautagesbericht) als PDF (A4): Firmenkopf mit Logo, Titel, Projekt-Angaben, Anwesende, Arbeiten, Besonderheiten,
// Fotos (zwei pro Zeile), Unterschrift des Kunden und Fußzeile mit den Firmendaten.

import { PDFDocument, type PDFImage } from "pdf-lib";
import type { Firma } from "@/lib/firma";
import { formatDatum } from "@/lib/format";
import {
  GRAU, INHALT_B, KOPF_OBEN, RAND_L, RAND_R, SCHRIFT, SEITE_B, UNTEN, ZEILE,
  Zeichner, firmenKopfZeichnen, fussZeilenZeichnen,
} from "@/lib/pdf-zeichner";

export type BerichtPdfDaten = {
  firma: Firma;
  /** Firmenlogo (PNG oder JPEG), erscheint oben links */
  logo?: Uint8Array;
  titel: string;
  entwurf: boolean;
  datum: string;
  projektName: string;
  projektnummer: string;
  baustelle: string;
  kunde: string;
  wetter: string;
  anwesend: string[];
  arbeiten: string;
  besonderheiten: string;
  /** JPEG-Bytes der Fotos in der gewählten Reihenfolge */
  fotos: Uint8Array[];
  erstelltVon: string;
  /** schon formatiert, z. B. „18.10.2026, 14:05“; leer bei Entwürfen */
  abgeschlossenAm: string;
  unterschrift?: { name: string; wann: string; bild: Uint8Array };
};

const FOTO_B = (INHALT_B - 12) / 2;
const FOTO_MAX_H = 175;

export async function berichtPdf(d: BerichtPdfDaten): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.titel} ${formatDatum(d.datum)} ${d.projektName}`.slice(0, 200));
  doc.setProducer("Maler Brinkmann");
  doc.setCreator("Maler Brinkmann");
  const z = new Zeichner(doc);
  await z.laden();

  const titel = d.entwurf ? `${d.titel} - Entwurf` : d.titel;
  const folgekopf = () => {
    z.neueSeite();
    z.text(titel, RAND_L, KOPF_OBEN, { font: z.bold, groesse: 12 });
    z.text(formatDatum(d.datum), SEITE_B - RAND_R, KOPF_OBEN, { rechts: true, farbe: GRAU });
    z.text(z.umbrechen(d.projektName, z.regular, SCHRIFT, INHALT_B - 90)[0] ?? "", RAND_L, KOPF_OBEN - 15, { farbe: GRAU });
    z.y = KOPF_OBEN - 44;
  };
  /** Platz für `hoehe` Punkte schaffen, sonst neue Seite. */
  const platz = (hoehe: number) => {
    if (z.y - hoehe < UNTEN) folgekopf();
  };
  const absatz = (text: string) => {
    for (const zeile of z.umbrechen(text, z.regular, SCHRIFT, INHALT_B)) {
      platz(ZEILE);
      z.text(zeile, RAND_L, z.y);
      z.y -= ZEILE;
    }
  };
  const abschnitt = (ueberschrift: string, text: string) => {
    platz(ZEILE * 3 + 8);
    z.y -= 10;
    z.text(ueberschrift, RAND_L, z.y, { font: z.bold, groesse: 10.5 });
    z.y -= ZEILE + 3;
    absatz(text.trim() ? text : "–");
  };

  // Seite 1: Firmenkopf, Titel, Angaben
  z.neueSeite();
  await firmenKopfZeichnen(z, d.firma, d.logo);
  z.y = 722;
  z.text(titel, RAND_L, z.y, { font: z.bold, groesse: 17 });
  z.y -= 28;

  const angaben: [string, string][] = [
    ["Datum", formatDatum(d.datum)],
    ["Projekt", [d.projektName, d.projektnummer && `(${d.projektnummer})`].filter(Boolean).join(" ")],
    ["Baustelle", d.baustelle],
    ["Kunde", d.kunde],
    ["Wetter", d.wetter],
    ["Erstellt von", d.erstelltVon],
  ];
  for (const [label, wert] of angaben) {
    if (!wert) continue;
    const zeilen = z.umbrechen(wert, z.regular, SCHRIFT, INHALT_B - 80);
    z.text(label, RAND_L, z.y, { font: z.bold, farbe: GRAU });
    for (const zeile of zeilen) {
      z.text(zeile, RAND_L + 80, z.y);
      z.y -= ZEILE;
    }
  }
  z.linie(RAND_L, z.y - 2, SEITE_B - RAND_R, z.y - 2, 0.6);
  z.y -= 6;

  abschnitt("Anwesend", d.anwesend.join(", "));
  abschnitt("Ausgeführte Arbeiten", d.arbeiten);
  if (d.besonderheiten.trim()) abschnitt("Besonderheiten, Behinderungen, Mängel", d.besonderheiten);

  // Fotos, zwei pro Zeile
  const bilder: PDFImage[] = [];
  for (const bytes of d.fotos) {
    try {
      bilder.push(await doc.embedJpg(bytes));
    } catch {
      // kaputtes Foto: wird weggelassen
    }
  }
  if (bilder.length) {
    platz(FOTO_MAX_H + ZEILE * 3);
    z.y -= 10;
    z.text("Fotos", RAND_L, z.y, { font: z.bold, groesse: 10.5 });
    z.y -= 8;
    for (let i = 0; i < bilder.length; i += 2) {
      const reihe = bilder.slice(i, i + 2).map((b) => {
        const faktor = Math.min(FOTO_B / b.width, FOTO_MAX_H / b.height, 1);
        return { b, w: b.width * faktor, h: b.height * faktor };
      });
      const hoehe = Math.max(...reihe.map((r) => r.h));
      platz(hoehe + 8);
      reihe.forEach((r, n) => {
        z.seite.drawImage(r.b, { x: RAND_L + n * (FOTO_B + 12), y: z.y - r.h, width: r.w, height: r.h });
      });
      z.y -= hoehe + 10;
    }
  }

  // Unterschrift des Kunden
  platz(110);
  z.y -= 14;
  z.text("Unterschrift Auftraggeber", RAND_L, z.y, { font: z.bold, groesse: 10.5 });
  z.y -= 8;
  if (d.unterschrift) {
    try {
      const bild = await doc.embedPng(d.unterschrift.bild);
      const faktor = Math.min(220 / bild.width, 60 / bild.height, 1);
      z.seite.drawImage(bild, { x: RAND_L, y: z.y - bild.height * faktor, width: bild.width * faktor, height: bild.height * faktor });
      z.y -= bild.height * faktor + 4;
    } catch {
      z.y -= 40;
    }
    z.linie(RAND_L, z.y, RAND_L + 220, z.y, 0.6, GRAU);
    z.text(`${d.unterschrift.name}, ${d.unterschrift.wann}`, RAND_L, z.y - 11, { groesse: 8.5 });
  } else {
    z.y -= 40;
    z.linie(RAND_L, z.y, RAND_L + 220, z.y, 0.6, GRAU);
    z.text("Ort, Datum, Unterschrift", RAND_L, z.y - 11, { groesse: 8.5 });
  }
  if (d.abgeschlossenAm) z.text(`Bericht abgeschlossen am ${d.abgeschlossenAm}`, SEITE_B - RAND_R, z.y - 11, { groesse: 8, farbe: GRAU, rechts: true });

  fussZeilenZeichnen(z, d.firma);
  return doc.save();
}
