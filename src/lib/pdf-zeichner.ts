// Gemeinsame Grundlagen der PDF-Dokumente (Angebot, Berichte …): Maße, Farben, Zeichner mit Textumbruch,
// Firmenblock mit Logo oben und Fußzeile mit Steuer-, Bank- und Seitenangaben.
// Läuft auf dem Server (pdf-lib ist reines JavaScript, die Schriften sind eingebaut).

import { type PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Firma } from "@/lib/firma";

// Maße in Punkt (1 pt = 1/72 Zoll). A4 = 595,28 × 841,89.
export const SEITE_B = 595.28;
export const SEITE_H = 841.89;
export const RAND_L = 56.7;
export const RAND_R = 56.7;
export const INHALT_B = SEITE_B - RAND_L - RAND_R;
export const KOPF_OBEN = 800;
export const UNTEN = 104; // darunter beginnt die Fußzeile
export const SCHRIFT = 9.5;
export const ZEILE = 12;

export const GRAU = rgb(0.4, 0.4, 0.4);
export const SCHWARZ = rgb(0, 0, 0);
export const HELLGRAU = rgb(0.93, 0.93, 0.93);
export const LINIE = rgb(0.7, 0.7, 0.7);

export class Zeichner {
  readonly doc: PDFDocument;
  regular!: PDFFont;
  bold!: PDFFont;
  kursiv!: PDFFont;
  seiten: PDFPage[] = [];
  seite!: PDFPage;
  y = 0;
  private erlaubt = new Map<PDFFont, Set<number>>();

  constructor(doc: PDFDocument) {
    this.doc = doc;
  }

  async laden() {
    this.regular = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.kursiv = await this.doc.embedFont(StandardFonts.HelveticaOblique);
  }

  /** Zeichen, die die Schrift nicht kann, durch „?“ ersetzen (sonst bricht pdf-lib ab). */
  sicher(text: string, font: PDFFont): string {
    let menge = this.erlaubt.get(font);
    if (!menge) {
      menge = new Set(font.getCharacterSet());
      this.erlaubt.set(font, menge);
    }
    let aus = "";
    for (const zeichen of text.replace(/ | |\t/g, " ").replace(/[\u0000-\u0008\u000b-\u001f]/g, "")) {
      const cp = zeichen.codePointAt(0) ?? 63;
      aus += menge.has(cp) ? zeichen : "?";
    }
    return aus;
  }

  breite(text: string, font: PDFFont, groesse: number): number {
    return font.widthOfTextAtSize(this.sicher(text, font), groesse);
  }

  /** Text in Zeilen umbrechen; „\n“ beginnt eine neue Zeile, zu lange Wörter werden getrennt. */
  umbrechen(text: string, font: PDFFont, groesse: number, maxBreite: number): string[] {
    const zeilen: string[] = [];
    for (const absatz of text.replace(/\r/g, "").split("\n")) {
      if (absatz.trim() === "") {
        zeilen.push("");
        continue;
      }
      let zeile = "";
      for (const wort of absatz.split(/ +/)) {
        const probe = zeile ? `${zeile} ${wort}` : wort;
        if (this.breite(probe, font, groesse) <= maxBreite) {
          zeile = probe;
          continue;
        }
        if (zeile) zeilen.push(zeile);
        let rest = wort;
        while (this.breite(rest, font, groesse) > maxBreite && rest.length > 1) {
          let n = rest.length - 1;
          while (n > 1 && this.breite(rest.slice(0, n), font, groesse) > maxBreite) n -= 1;
          zeilen.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        zeile = rest;
      }
      zeilen.push(zeile);
    }
    return zeilen;
  }

  neueSeite(): PDFPage {
    this.seite = this.doc.addPage([SEITE_B, SEITE_H]);
    this.seiten.push(this.seite);
    this.y = KOPF_OBEN;
    return this.seite;
  }

  text(t: string, x: number, y: number, o: { font?: PDFFont; groesse?: number; farbe?: ReturnType<typeof rgb>; rechts?: boolean } = {}) {
    const font = o.font ?? this.regular;
    const groesse = o.groesse ?? SCHRIFT;
    const s = this.sicher(t, font);
    if (!s) return;
    const px = o.rechts ? x - font.widthOfTextAtSize(s, groesse) : x;
    this.seite.drawText(s, { x: px, y, size: groesse, font, color: o.farbe ?? SCHWARZ });
  }

  linie(x1: number, y1: number, x2: number, y2: number, dicke = 0.5, farbe = LINIE) {
    this.seite.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: dicke, color: farbe });
  }
}

/** Firmenblock rechts oben (Name, Anschrift, Telefon, E-Mail, Web) und optional das Logo oben links (höchstens 170 × 56 pt). */
export async function firmenKopfZeichnen(z: Zeichner, f: Firma, logoBytes?: Uint8Array) {
  const blockX = 355;
  let by = 805;
  for (const [i, zeile] of [f.name, f.strasse, [f.plz, f.ort].filter(Boolean).join(" ")].entries()) {
    if (zeile) { z.text(zeile, blockX, by, { font: i === 0 ? z.bold : z.regular, groesse: i === 0 ? 11 : SCHRIFT }); by -= i === 0 ? 14 : ZEILE; }
  }
  by -= 6;
  if (f.telefon) { z.text(`Telefon ${f.telefon}`, blockX, by); by -= ZEILE; }
  if (f.email) { z.text(`E-Mail ${f.email}`, blockX, by); by -= ZEILE; }
  if (f.website) { z.text(f.website, blockX, by); by -= ZEILE; }

  // Ein kaputtes Logo wird weggelassen
  if (logoBytes) {
    try {
      const istPng = logoBytes[0] === 0x89 && logoBytes[1] === 0x50;
      const logo = istPng ? await z.doc.embedPng(logoBytes) : await z.doc.embedJpg(logoBytes);
      const faktor = Math.min(170 / logo.width, 56 / logo.height, 1);
      const w = logo.width * faktor;
      const h = logo.height * faktor;
      z.seite.drawImage(logo, { x: RAND_L, y: 826 - h, width: w, height: h });
    } catch {
      // Logo nicht lesbar: ohne Logo weiter
    }
  }
}

/** Fußzeile auf jeder Seite: Inhaber, Steuerangaben, Bank, „Seite x von y“. */
export function fussZeilenZeichnen(z: Zeichner, f: Firma) {
  const gesamtSeiten = z.seiten.length;
  z.seiten.forEach((seite, i) => {
    z.seite = seite;
    z.linie(RAND_L, 86, SEITE_B - RAND_R, 86, 0.5, LINIE);
    const spalte1 = [f.inhaber ? `Inhaber` : "", f.inhaber].filter(Boolean);
    const spalte2 = [f.ustid && `USt-ID: ${f.ustid}`, f.steuernummer && `Steuernummer: ${f.steuernummer}`].filter((t): t is string => Boolean(t));
    const spalte3 = [f.bank, f.iban && `IBAN: ${f.iban}`, f.bic && `BIC: ${f.bic}`].filter((t): t is string => Boolean(t));
    [[spalte1, RAND_L], [spalte2, RAND_L + 140], [spalte3, RAND_L + 290]].forEach(([zeilen, x]) => {
      (zeilen as string[]).forEach((t, n) => z.text(t, x as number, 76 - n * 9.5, { groesse: 7.5, farbe: GRAU }));
    });
    z.text(`Seite ${i + 1} von ${gesamtSeiten}`, SEITE_B - RAND_R, 76, { groesse: 7.5, farbe: GRAU, rechts: true });
  });
}
