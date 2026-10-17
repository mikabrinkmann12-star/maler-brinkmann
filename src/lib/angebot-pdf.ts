// Angebot als PDF (A4), im Aufbau des Plancraft-Angebots: Briefkopf mit Absenderzeile, Empfänger,
// Firmenblock rechts, Kunde/Projekt/Datum, Betreff, Anfangstext, Positionstabelle mit „Übertrag“ auf Folgeseiten,
// Summen, Schlusstext, Unterschriftsfeld und Fußzeile mit Steuer-, Bank- und Seitenangaben.
// Läuft auf dem Server (pdf-lib ist reines JavaScript, die Schriften sind eingebaut).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { AngebotStatus, Berechnung, BerechneteZeile } from "@/lib/angebot";
import { absenderZeile, type Firma } from "@/lib/firma";
import { formatDatum, formatZahl } from "@/lib/format";

export type AngebotPdfDaten = {
  firma: Firma;
  status: AngebotStatus;
  datum: string;
  betreff: string;
  leistungsort: string;
  empfaenger: string;
  einleitung: string;
  schlusstext: string;
  kundennummer: string;
  projektnummer: string;
  berechnung: Berechnung;
  reverseChargeText: string;
  /** JPEG-Bytes der Bild-Bausteine (Schlüssel = Baustein-ID) */
  bilder: Record<string, Uint8Array>;
  /** Firmenlogo (PNG oder JPEG), erscheint oben links im Briefkopf */
  logo?: Uint8Array;
};

// Maße in Punkt (1 pt = 1/72 Zoll). A4 = 595,28 × 841,89.
const SEITE_B = 595.28;
const SEITE_H = 841.89;
const RAND_L = 56.7;
const RAND_R = 56.7;
const INHALT_B = SEITE_B - RAND_L - RAND_R;
const KOPF_OBEN = 800;
const UNTEN = 104; // darunter beginnt die Fußzeile
const SCHRIFT = 9.5;
const ZEILE = 12;

// Spalten der Tabelle
const SPALTE = {
  pos: { x: RAND_L, b: 34 },
  menge: { x: RAND_L + 34, b: 54 }, // rechtsbündig
  einheit: { x: RAND_L + 34 + 54 + 6, b: 40 },
  text: { x: RAND_L + 34 + 54 + 6 + 40 + 6, b: 0 },
  preis: { x: 0, b: 58 }, // rechtsbündig
  gesamt: { x: 0, b: 66 }, // rechtsbündig
};
SPALTE.gesamt.x = SEITE_B - RAND_R - SPALTE.gesamt.b;
SPALTE.preis.x = SPALTE.gesamt.x - 4 - SPALTE.preis.b;
SPALTE.text.b = SPALTE.preis.x - 8 - SPALTE.text.x;

const GRAU = rgb(0.4, 0.4, 0.4);
const SCHWARZ = rgb(0, 0, 0);
const HELLGRAU = rgb(0.93, 0.93, 0.93);
const LINIE = rgb(0.7, 0.7, 0.7);

const zahl = (w: number, min = 2, max = 2) => formatZahl(w, { min, max });
const euro = (w: number) => `${zahl(w)} €`;

class Zeichner {
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

export async function angebotPdf(d: AngebotPdfDaten): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Angebot ${d.betreff}`.slice(0, 200));
  doc.setProducer("Maler Brinkmann");
  doc.setCreator("Maler Brinkmann");
  const z = new Zeichner(doc);
  await z.laden();

  const titel = d.status === "entwurf" ? "Angebot - Entwurf" : "Angebot";
  const bilder = new Map<string, PDFImage>();
  for (const [id, bytes] of Object.entries(d.bilder)) {
    try {
      bilder.set(id, await doc.embedJpg(bytes));
    } catch {
      // kaputtes Bild: wird weggelassen
    }
  }

  // ---------------------------------------------------------------------
  // Seite 1: Briefkopf
  // ---------------------------------------------------------------------
  z.neueSeite();
  const f = d.firma;
  const blockX = 355;
  let by = 805;
  for (const [i, zeile] of [f.name, f.strasse, [f.plz, f.ort].filter(Boolean).join(" ")].entries()) {
    if (zeile) { z.text(zeile, blockX, by, { font: i === 0 ? z.bold : z.regular, groesse: i === 0 ? 11 : SCHRIFT }); by -= i === 0 ? 14 : ZEILE; }
  }
  by -= 6;
  if (f.telefon) { z.text(`Telefon ${f.telefon}`, blockX, by); by -= ZEILE; }
  if (f.email) { z.text(`E-Mail ${f.email}`, blockX, by); by -= ZEILE; }
  if (f.website) { z.text(f.website, blockX, by); by -= ZEILE; }

  // Logo oben links (höchstens 170 × 56 pt), ein kaputtes Logo wird weggelassen
  if (d.logo) {
    try {
      const istPng = d.logo[0] === 0x89 && d.logo[1] === 0x50;
      const logo = istPng ? await doc.embedPng(d.logo) : await doc.embedJpg(d.logo);
      const faktor = Math.min(170 / logo.width, 56 / logo.height, 1);
      const w = logo.width * faktor;
      const h = logo.height * faktor;
      z.seite.drawImage(logo, { x: RAND_L, y: 826 - h, width: w, height: h });
    } catch {
      // Logo nicht lesbar: ohne Logo weiter
    }
  }

  // Anschriftfeld nach DIN 5008 Form B (Fensterbriefumschlag): 20 mm von links, 45 mm von oben, 85 × 45 mm.
  // Oben im Fenster die kleine Absenderzeile (Rücksendeangabe), darunter die Anschrift des Empfängers.
  const mm = (wert: number) => wert * 72 / 25.4;
  const ausOben = (wert: number) => SEITE_H - mm(wert);
  const fensterBreite = mm(85);
  const passend = (text: string, font: PDFFont, groesse: number, kleinste: number): { text: string; groesse: number } => {
    let g = groesse;
    while (g > kleinste && z.breite(text, font, g) > fensterBreite) g -= 0.5;
    let t = text;
    while (t.length > 1 && z.breite(t, font, g) > fensterBreite) t = t.slice(0, -1);
    return { text: t === text ? t : `${t.trimEnd()}…`, groesse: g };
  };
  const absender = absenderZeile(f);
  if (absender) {
    const a = passend(absender, z.regular, 7.5, 6);
    z.text(a.text, RAND_L, ausOben(48.6), { groesse: a.groesse, farbe: GRAU });
    z.linie(RAND_L, ausOben(50.2), RAND_L + fensterBreite, ausOben(50.2), 0.3, LINIE);
  }
  let ey = ausOben(65.5);
  for (const zeile of d.empfaenger.split("\n").map((t) => t.trim()).filter(Boolean)) {
    const a = passend(zeile, z.regular, 10, 7.5);
    z.text(a.text, RAND_L, ey, { groesse: a.groesse });
    ey -= 12.2;
  }

  // Falz- und Lochmarke am linken Rand (DIN 5008 Form B: 105 mm, 148,5 mm und 210 mm von oben)
  for (const [von, laenge] of [[105, 4], [148.5, 6], [210, 4]] as const) {
    z.linie(0, ausOben(von), mm(laenge), ausOben(von), 0.4, GRAU);
  }

  // Kunde / Projekt / Datum rechts neben dem Anschriftfeld, der Titel darunter (Betreffzone ab 98,5 mm)
  const infoY = ausOben(65.5);
  const spalten: [string, string][] = [["Kunde", d.kundennummer], ["Projekt", d.projektnummer], ["Datum", formatDatum(d.datum)]];
  const spaltenX = [355, 430, 495];
  spalten.forEach(([label, wert], i) => {
    z.text(label, spaltenX[i], infoY + 4, { font: z.bold, groesse: 8, farbe: GRAU });
    z.text(wert || "–", spaltenX[i], infoY - 9, { groesse: 9 });
  });
  const titelY = ausOben(100);
  z.text(titel, RAND_L, titelY, { font: z.bold, groesse: 15 });

  z.y = titelY - 32;
  z.text("Betreff", RAND_L, z.y, { font: z.bold });
  z.y -= ZEILE;
  for (const zeile of z.umbrechen(d.betreff, z.bold, 11, INHALT_B)) {
    z.text(zeile, RAND_L, z.y, { font: z.bold, groesse: 11 });
    z.y -= 14;
  }
  if (d.leistungsort.trim()) {
    z.y -= 6;
    z.text("Leistungsort", RAND_L, z.y, { font: z.bold });
    z.y -= ZEILE;
    for (const zeile of z.umbrechen(d.leistungsort, z.regular, SCHRIFT, INHALT_B)) {
      z.text(zeile, RAND_L, z.y);
      z.y -= ZEILE;
    }
  }
  if (d.einleitung.trim()) {
    z.y -= 10;
    for (const zeile of z.umbrechen(d.einleitung, z.regular, SCHRIFT, INHALT_B)) {
      if (z.y < UNTEN + ZEILE) { z.neueSeite(); folgekopf(z, titel, d); }
      z.text(zeile, RAND_L, z.y);
      z.y -= ZEILE;
    }
  }
  z.y -= 12;

  // ---------------------------------------------------------------------
  // Tabelle
  // ---------------------------------------------------------------------
  let summeBisher = 0; // Cent der Positionen bis zur aktuellen Stelle
  const tabellenKopf = () => {
    z.text("Pos.", SPALTE.pos.x, z.y, { font: z.bold, groesse: 8.5 });
    z.text("Menge", SPALTE.menge.x + SPALTE.menge.b, z.y, { font: z.bold, groesse: 8.5, rechts: true });
    z.text("Einheit", SPALTE.einheit.x, z.y, { font: z.bold, groesse: 8.5 });
    z.text("Beschreibung", SPALTE.text.x, z.y, { font: z.bold, groesse: 8.5 });
    z.text("Preis", SPALTE.preis.x + SPALTE.preis.b, z.y, { font: z.bold, groesse: 8.5, rechts: true });
    z.text("Gesamt", SPALTE.gesamt.x + SPALTE.gesamt.b, z.y, { font: z.bold, groesse: 8.5, rechts: true });
    z.linie(RAND_L, z.y - 4, SEITE_B - RAND_R, z.y - 4, 0.8, SCHWARZ);
    z.y -= 18;
  };
  const uebertrag = () => {
    if (summeBisher === 0) return;
    z.text("Übertrag:", SPALTE.preis.x + SPALTE.preis.b, z.y, { font: z.bold, rechts: true });
    z.text(zahl(summeBisher / 100), SPALTE.gesamt.x + SPALTE.gesamt.b, z.y, { font: z.bold, rechts: true });
    z.y -= ZEILE + 4;
  };
  const folgeseite = () => {
    z.neueSeite();
    folgekopf(z, titel, d);
    tabellenKopf();
    uebertrag();
  };
  /** Platz für `hoehe` Punkte schaffen, sonst neue Seite. */
  const platz = (hoehe: number) => {
    if (z.y - hoehe < UNTEN) folgeseite();
  };

  if (z.y - 60 < UNTEN) { z.neueSeite(); folgekopf(z, titel, d); }
  tabellenKopf();

  for (const zeile of d.berechnung.zeilen) {
    zeichneZeile(z, zeile, bilder, platz, folgeseite, () => summeBisher);
    if (zeile.baustein.typ === "position" && zeile.gesamt !== null) summeBisher += Math.round(zeile.gesamt * 100);
  }

  // ---------------------------------------------------------------------
  // Summen, Schlusstext, Unterschrift
  // ---------------------------------------------------------------------
  const b = d.berechnung;
  const summenZeilen: { label: string; wert: string; stark?: boolean }[] = [{ label: "Nettosumme", wert: euro(b.netto) }];
  if (b.rabattProzent > 0) {
    summenZeilen.push({ label: `Rabatt ${zahl(b.rabattProzent, 0, 2)} %`, wert: `-${euro(b.rabatt)}` });
    summenZeilen.push({ label: "Netto nach Rabatt", wert: euro(b.nettoNachRabatt) });
  }
  if (!b.reverseCharge && b.steuersatz > 0) {
    summenZeilen.push({ label: `Umsatzsteuer ${b.steuersatz} %`, wert: euro(b.ust) });
    summenZeilen.push({ label: "Gesamtsumme brutto", wert: euro(b.brutto), stark: true });
  }
  const hinweisZeilen = b.reverseCharge ? z.umbrechen(d.reverseChargeText, z.regular, 8.5, INHALT_B) : [];

  platz(summenZeilen.length * 15 + hinweisZeilen.length * 11 + 40);
  z.y -= 6;
  z.linie(SPALTE.preis.x - 70, z.y + 10, SEITE_B - RAND_R, z.y + 10, 0.8, SCHWARZ);
  for (const s of summenZeilen) {
    const font = s.stark ? z.bold : z.regular;
    z.text(s.label, SPALTE.gesamt.x - 6, z.y, { font, rechts: true });
    z.text(s.wert, SEITE_B - RAND_R, z.y, { font, rechts: true });
    z.y -= 15;
  }
  if (hinweisZeilen.length) {
    z.y -= 4;
    for (const zeile of hinweisZeilen) {
      z.text(zeile, RAND_L, z.y, { groesse: 8.5 });
      z.y -= 11;
    }
  }

  z.y -= 14;
  const schluss = d.schlusstext.trim() ? z.umbrechen(d.schlusstext, z.regular, SCHRIFT, INHALT_B) : [];
  // Unterschriftsblock zusammenhalten
  platz(Math.min(schluss.length, 3) * ZEILE + 90);
  for (const zeile of schluss) {
    if (z.y < UNTEN + 80) { z.neueSeite(); folgekopf(z, titel, d); }
    z.text(zeile, RAND_L, z.y);
    z.y -= ZEILE;
  }
  z.y -= 8;
  if (z.y < UNTEN + 70) { z.neueSeite(); folgekopf(z, titel, d); }
  z.text("Mit dem Angebot bin ich einverstanden.", RAND_L, z.y);
  z.y -= 44;
  z.linie(RAND_L, z.y, RAND_L + 220, z.y, 0.6, SCHWARZ);
  z.text("Ort, Datum, Unterschrift Auftraggeber", RAND_L, z.y - 11, { groesse: 8.5 });

  // ---------------------------------------------------------------------
  // Fußzeile auf jeder Seite
  // ---------------------------------------------------------------------
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

  return doc.save();
}

/** Kopf der Folgeseiten: Titel, Betreff, Datum. */
function folgekopf(z: Zeichner, titel: string, d: AngebotPdfDaten) {
  z.text(titel, RAND_L, KOPF_OBEN, { font: z.bold, groesse: 12 });
  z.text(`vom ${formatDatum(d.datum)}`, SEITE_B - RAND_R, KOPF_OBEN, { rechts: true, farbe: GRAU });
  const betreff = z.umbrechen(d.betreff, z.regular, SCHRIFT, INHALT_B - 90)[0] ?? "";
  z.text(betreff, RAND_L, KOPF_OBEN - 15, { farbe: GRAU });
  z.y = KOPF_OBEN - 44;
}

/** Eine Zeile der Tabelle zeichnen (Position, Titel, Text, Zwischensumme oder Bild). */
function zeichneZeile(
  z: Zeichner,
  zeile: BerechneteZeile,
  bilder: Map<string, PDFImage>,
  platz: (hoehe: number) => void,
  folgeseite: () => void,
  summeBisher: () => number,
) {
  void summeBisher;
  const b = zeile.baustein;

  if (b.typ === "titel") {
    platz(34);
    z.y -= 4;
    z.seite.drawRectangle({ x: RAND_L, y: z.y - 4, width: INHALT_B, height: 16, color: HELLGRAU });
    z.text(zeile.nummer, SPALTE.pos.x + 2, z.y, { font: z.bold, groesse: 10 });
    z.text(b.kurztext, SPALTE.menge.x, z.y, { font: z.bold, groesse: 10 });
    z.y -= 22;
    return;
  }

  if (b.typ === "zwischensumme") {
    platz(30);
    z.linie(SPALTE.preis.x - 60, z.y + 9, SEITE_B - RAND_R, z.y + 9, 0.5, SCHWARZ);
    z.text("Zwischensumme:", SPALTE.preis.x + SPALTE.preis.b, z.y, { font: z.bold, rechts: true });
    z.text(zahl(zeile.zwischensumme ?? 0), SPALTE.gesamt.x + SPALTE.gesamt.b, z.y, { font: z.bold, rechts: true });
    z.y -= 22;
    return;
  }

  if (b.typ === "bild") {
    const bild = bilder.get(b.id);
    if (!bild) return;
    const maxB = Math.min(300, INHALT_B - 34);
    const maxH = 230;
    const faktor = Math.min(maxB / bild.width, maxH / bild.height, 1);
    const w = bild.width * faktor;
    const h = bild.height * faktor;
    const unterschrift = b.kurztext ? z.umbrechen(b.kurztext, z.kursiv, 8.5, maxB) : [];
    platz(h + unterschrift.length * 11 + 16);
    z.seite.drawImage(bild, { x: SPALTE.menge.x, y: z.y - h + 6, width: w, height: h });
    z.y -= h + 4;
    for (const t of unterschrift) {
      z.text(t, SPALTE.menge.x, z.y, { font: z.kursiv, groesse: 8.5, farbe: GRAU });
      z.y -= 11;
    }
    z.y -= 8;
    return;
  }

  // Text und Position: Beschreibung umbrechen
  const volleBreite = b.typ === "text";
  const textX = volleBreite ? SPALTE.menge.x : SPALTE.text.x;
  const textB = volleBreite ? SEITE_B - RAND_R - textX : SPALTE.text.b;
  const zeilen: { t: string; bold: boolean }[] = [];
  // Mit Langtext ist der Kurztext die fette Überschrift, sonst steht der Text normal (wie in Plancraft).
  const kurzFett = b.langtext.trim() !== "";
  if (b.kurztext.trim()) for (const t of z.umbrechen(b.kurztext, kurzFett ? z.bold : z.regular, SCHRIFT, textB)) zeilen.push({ t, bold: kurzFett });
  if (b.langtext.trim()) for (const t of z.umbrechen(b.langtext, z.regular, SCHRIFT, textB)) zeilen.push({ t, bold: false });
  if (zeilen.length === 0) zeilen.push({ t: "", bold: false });

  const hoehe = zeilen.length * ZEILE + 8;
  if (hoehe < 330) platz(hoehe);

  let erste = true;
  for (const [i, l] of zeilen.entries()) {
    if (z.y < UNTEN + ZEILE) {
      folgeseite();
      erste = false; // Nummer und Preise stehen nur in der ersten Zeile
    }
    if (i === 0 && erste) {
      z.text(zeile.nummer, SPALTE.pos.x, z.y);
      if (b.typ === "position") {
        z.text(zahl(b.menge ?? 0, 2, 3), SPALTE.menge.x + SPALTE.menge.b, z.y, { rechts: true });
        z.text(b.einheit, SPALTE.einheit.x, z.y);
        z.text(zahl(b.einzelpreis ?? 0), SPALTE.preis.x + SPALTE.preis.b, z.y, { rechts: true });
        z.text(zahl(zeile.gesamt ?? 0), SPALTE.gesamt.x + SPALTE.gesamt.b, z.y, { rechts: true });
      }
    }
    z.text(l.t, textX, z.y, { font: l.bold ? z.bold : z.regular });
    z.y -= ZEILE;
  }
  z.y -= 8;
}
