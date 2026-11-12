// Gemeinsame Grundlagen der PDF-Dokumente (Angebot, Berichte …): Maße, Farben, Zeichner mit Textumbruch,
// Firmenblock mit Logo oben und Fußzeile mit Steuer-, Bank- und Seitenangaben.
// Läuft auf dem Server (pdf-lib ist reines JavaScript, die Schriften sind eingebaut).

import { type PDFDocument, type PDFImage, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Firma } from "@/lib/firma";

// Maße in Punkt (1 pt = 1/72 Zoll). A4 = 595,28 × 841,89.
export const SEITE_B = 595.28;
export const SEITE_H = 841.89;
export const RAND_L = 56.7;
export const RAND_R = 56.7;
export const INHALT_B = SEITE_B - RAND_L - RAND_R;
export const KOPF_OBEN = 800;
export const UNTEN = 100; // darunter beginnt die Fußzeile
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

/** Logo einbetten (PNG oder JPEG); kaputt → undefined. */
export async function logoEinbetten(z: Zeichner, logoBytes?: Uint8Array): Promise<PDFImage | undefined> {
  if (!logoBytes) return undefined;
  try {
    const istPng = logoBytes[0] === 0x89 && logoBytes[1] === 0x50;
    return istPng ? await z.doc.embedPng(logoBytes) : await z.doc.embedJpg(logoBytes);
  } catch {
    return undefined;
  }
}

/** Logo rechtsbündig in einen Kasten (Breite × Höhe) zeichnen, Oberkante bei `oben`. Gibt die Unterkante zurück. */
export function logoZeichnen(z: Zeichner, logo: PDFImage | undefined, oben: number, maxB: number, maxH: number): number {
  if (!logo) return oben;
  const faktor = Math.min(maxB / logo.width, maxH / logo.height, 1);
  const w = logo.width * faktor;
  const h = logo.height * faktor;
  z.seite.drawImage(logo, { x: SEITE_B - RAND_R - w, y: oben - h, width: w, height: h });
  return oben - h;
}

/**
 * Briefkopf wie Plancraft (Angebote und Rechnungen): Logo oben rechts, darunter der Firmenblock
 * (Name fett, Anschrift, „Telefon“/„E-Mail“ mit eingerückten Werten, optional die Ansprechperson).
 */
export function briefKopfZeichnen(z: Zeichner, f: Firma, logo: PDFImage | undefined, ansprechperson?: { name: string; telefon?: string }): number {
  logoZeichnen(z, logo, 735, 165, 75);
  const x = SEITE_B - RAND_R - 150;
  let y = 631;
  const zeile = (t: string, bold = false) => { if (t) { z.text(t, x, y, { font: bold ? z.bold : z.regular }); y -= 11.7; } };
  zeile(f.name, true);
  zeile(f.strasse);
  zeile([f.plz, f.ort].filter(Boolean).join(" "));
  y -= 4;
  const paar = (label: string, wert: string) => { if (wert) { z.text(label, x, y); z.text(wert, x + 45, y); y -= 11.7; } };
  paar("Telefon", f.telefon);
  paar("E-Mail", f.email);
  if (f.website) zeile(f.website);
  if (ansprechperson?.name) {
    y -= 5;
    zeile("Ansprechperson", true);
    zeile(ansprechperson.name);
    if (ansprechperson.telefon) { y -= 4; paar("Telefon", ansprechperson.telefon); }
  }
  return y; // Unterkante des Blocks
}


/** Fußzeile auf jeder Seite wie Plancraft: Inhaber, Steuerangaben, Bank (Überschriften fett), „Seite x von y“. */
export function fussZeilenZeichnen(z: Zeichner, f: Firma) {
  const gesamtSeiten = z.seiten.length;
  const dunkel = rgb(0.15, 0.15, 0.15);
  z.seiten.forEach((seite, i) => {
    z.seite = seite;
    const spalte1: [string, boolean][] = f.inhaber ? [["Inhaber", true], [f.inhaber, false]] : [];
    const spalte2: [string, boolean][] = [f.ustid && `USt-ID: ${f.ustid}`, f.steuernummer && `Steuernummer: ${f.steuernummer}`]
      .filter((t): t is string => Boolean(t)).map((t) => [t, false]);
    const spalte3: [string, boolean][] = [
      ...(f.bank ? [[f.bank, true] as [string, boolean]] : []),
      ...[f.iban && `IBAN: ${f.iban}`, f.bic && `BIC: ${f.bic}`].filter((t): t is string => Boolean(t)).map((t) => [t, false] as [string, boolean]),
    ];
    ([[spalte1, RAND_L], [spalte2, RAND_L + 122], [spalte3, RAND_L + 278]] as const).forEach(([zeilen, x]) => {
      zeilen.forEach(([t, fett], n) => z.text(t, x, 70 - n * 9, { groesse: 7, farbe: dunkel, font: fett ? z.bold : z.regular }));
    });
    z.text(`Seite ${i + 1} von ${gesamtSeiten}`, SEITE_B - RAND_R, 70, { groesse: 7, farbe: dunkel, rechts: true });
  });
}

// ---------------------------------------------------------------------------
// Bausteine für weitere Schreiben im Plancraft-Stil (Mahnung, Bericht). Angebot und Rechnung zeichnen das selbst (angebot-pdf.ts).
// ---------------------------------------------------------------------------

const mm = (wert: number) => (wert * 72) / 25.4;
const ausOben = (wert: number) => SEITE_H - mm(wert);

/** Anschriftfeld nach DIN 5008 Form B wie beim Angebot: kleine fette Absenderzeile, Anschrift, Falz- und Lochmarken. */
export function anschriftFeldZeichnen(z: Zeichner, absender: string, empfaenger: string) {
  const fensterBreite = mm(85);
  const passend = (text: string, font: PDFFont, groesse: number, kleinste: number) => {
    let g = groesse;
    while (g > kleinste && z.breite(text, font, g) > fensterBreite) g -= 0.5;
    let t = text;
    while (t.length > 1 && z.breite(t, font, g) > fensterBreite) t = t.slice(0, -1);
    return { text: t === text ? t : `${t.trimEnd()}…`, groesse: g };
  };
  if (absender) {
    const a = passend(absender, z.bold, 6.5, 5.5);
    z.text(a.text, RAND_L, ausOben(56.4), { font: z.bold, groesse: a.groesse });
  }
  let y = ausOben(62);
  for (const zeile of empfaenger.split("\n").map((t) => t.trim()).filter(Boolean)) {
    const a = passend(zeile, z.regular, SCHRIFT, 7.5);
    z.text(a.text, RAND_L, y, { groesse: a.groesse });
    y -= 11.7;
  }
  for (const [von, laenge] of [[105, 4], [148.5, 6], [210, 4]] as const) z.linie(0, ausOben(von), mm(laenge), ausOben(von), 0.4, LINIE);
}

/**
 * Titel und Angaben-Zeile wie beim Angebot: Titel fett, darunter links „Betreff“, rechts die Spalten (Bezeichnung, Wert fett),
 * die letzte rechtsbündig. Setzt z.y unter den Block.
 */
export function titelUndAngabenZeichnen(z: Zeichner, titel: string, oben: number, spalten: [string, string][], betreff: { label: string; text: string }) {
  z.y = oben;
  z.text(titel, RAND_L, z.y, { font: z.bold, groesse: 13 });
  z.y -= 26;
  let rechts = SEITE_B - RAND_R;
  const xs: number[] = [];
  for (let i = spalten.length - 1; i >= 0; i--) {
    const [label, wert] = spalten[i];
    const w = Math.max(z.breite(label, z.regular, SCHRIFT), z.breite(wert || "–", z.bold, SCHRIFT));
    const letzte = i === spalten.length - 1;
    xs[i] = letzte ? rechts : rechts - w;
    rechts = (letzte ? rechts - w : xs[i]) - 14;
  }
  spalten.forEach(([label, wert], i) => {
    const r = i === spalten.length - 1;
    z.text(label, xs[i], z.y, { rechts: r });
    z.text(wert || "–", xs[i], z.y - 11.7, { font: z.bold, rechts: r });
  });
  let by = z.y - 11.7;
  if (betreff.text.trim()) {
    z.text(betreff.label, RAND_L, z.y);
    for (const zeile of z.umbrechen(betreff.text, z.bold, SCHRIFT, Math.max(120, rechts - RAND_L))) { z.text(zeile, RAND_L, by, { font: z.bold }); by -= 11.7; }
  }
  z.y = Math.min(by, z.y - 23.4) - 8;
}

/** Weitere Angabe unter der Angaben-Zeile: Bezeichnung, darunter der Wert fett (umbrochen). */
export function angabeZeichnen(z: Zeichner, label: string, wert: string) {
  if (!wert.trim()) return;
  z.text(label, RAND_L, z.y);
  z.y -= 11.7;
  for (const zeile of z.umbrechen(wert, z.bold, SCHRIFT, INHALT_B)) { z.text(zeile, RAND_L, z.y, { font: z.bold }); z.y -= 11.7; }
  z.y -= 8;
}

/** Graues Band über die ganze Breite mit fetter Überschrift (wie der Tabellenkopf beim Angebot). Setzt z.y darunter. */
export function bandZeichnen(z: Zeichner, text: string, rechtsText = "") {
  z.seite.drawRectangle({ x: RAND_L, y: z.y - 6, width: INHALT_B, height: 19, color: rgb(0.9, 0.9, 0.9) });
  z.text(text, RAND_L + 6, z.y, { font: z.bold });
  if (rechtsText) z.text(rechtsText, SEITE_B - RAND_R - 6, z.y, { font: z.bold, rechts: true });
  z.y -= 22;
}

/** Kopf der Folgeseiten wie beim Angebot: Titel fett, eine Zeile darunter, kleines Logo rechts. */
export function folgeKopfZeichnen(z: Zeichner, titel: string, unterzeile: string, zweite: string, logo: PDFImage | undefined) {
  logoZeichnen(z, logo, KOPF_OBEN + 6, 70, 34);
  z.text(titel, RAND_L, KOPF_OBEN, { font: z.bold, groesse: 11 });
  z.text(z.umbrechen(unterzeile, z.regular, SCHRIFT, INHALT_B - 110)[0] ?? "", RAND_L, KOPF_OBEN - 13);
  if (zweite) z.text(zweite, RAND_L, KOPF_OBEN - 25);
  z.y = KOPF_OBEN - 58;
}
